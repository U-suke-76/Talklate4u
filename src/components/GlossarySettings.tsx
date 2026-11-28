import React, { useState } from 'react';
import { GlossaryEntry, GlossaryPack } from '../types/config';
import {
  countTsvRows,
  extractTsvFromZip,
  isTsvContent,
} from '../services/glossary/TsvGlossaryPack';

export type { GlossaryEntry };

interface GlossarySettingsProps {
  entries: GlossaryEntry[];
  onChange: (entries: GlossaryEntry[]) => void;
  packs: GlossaryPack[];
  onPacksChange: (packs: GlossaryPack[]) => void;
}

export const GlossarySettings: React.FC<GlossarySettingsProps> = ({
  entries,
  onChange,
  packs,
  onPacksChange,
}) => {
  const [importError, setImportError] = useState('');

  const handleImportPacks = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setImportError('');
    const imported: GlossaryPack[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        let contents: string[];
        if (/\.zip$/i.test(file.name)) {
          const zip = new Uint8Array(await file.arrayBuffer());
          contents = extractTsvFromZip(zip)
            .map((f) => f.content)
            .filter(isTsvContent);
        } else {
          const text = await file.text();
          contents = isTsvContent(text) ? [text] : [];
        }

        if (contents.length === 0) {
          errors.push(`"${file.name}" contains no valid TSV (header row must be tab-separated).`);
          continue;
        }
        imported.push({
          id: crypto.randomUUID(),
          name: file.name.replace(/\.(tsv|txt|zip)$/i, ''),
          enabled: true,
          contents,
          rowCount: contents.reduce((n, c) => n + countTsvRows(c), 0),
        });
      } catch (err) {
        errors.push(`Failed to read "${file.name}": ${(err as Error).message}`);
      }
    }
    setImportError(errors.join(' '));

    if (imported.length > 0) {
      // Re-importing a pack with the same name replaces the old one.
      const names = new Set(imported.map((p) => p.name));
      onPacksChange([...packs.filter((p) => !names.has(p.name)), ...imported]);
    }
  };

  const togglePack = (id: string) => {
    onPacksChange(packs.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  };

  const deletePack = (id: string) => {
    onPacksChange(packs.filter((p) => p.id !== id));
  };
  const [newEntry, setNewEntry] = useState<Omit<GlossaryEntry, 'id'>>({
    sourceText: '',
    sourceLang: 'en',
    targetText: '',
    targetLang: 'ja',
    bidirectional: true, // Default to true as requested
  });

  const handleAdd = () => {
    if (!newEntry.sourceText.trim() || !newEntry.targetText.trim()) return;

    const entry: GlossaryEntry = {
      ...newEntry,
      id: crypto.randomUUID(),
    };

    onChange([...entries, entry]);
    setNewEntry({ ...newEntry, sourceText: '', targetText: '' }); // Reset text fields but keep langs
  };

  const handleDelete = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= entries.length) return;
    const updated = [...entries];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    onChange(updated);
  };

  const toggleDirection = () => {
    setNewEntry((prev) => ({ ...prev, bidirectional: !prev.bidirectional }));
  };

  return (
    <div className="p-4 space-y-4">
      <h4 className="text-md font-bold text-gray-300">Glossary / Dictionary</h4>
      <p className="text-sm text-gray-400">
        Define custom translations for game terms. Use <b>Bi-directional (⇔)</b> to apply the rule
        in both translation directions.
      </p>
      <div className="text-xs text-info bg-gray-800/80 border border-info/30 rounded px-3 py-2">
        💡 <b>Tip:</b> Terms placed higher in the list are also prioritized for{' '}
        <b>Whisper speech recognition accuracy</b> (when Input Language is set to a fixed language).
      </div>

      {/* Add New Entry Form */}
      {/* Grid Layout: SrcLang | SrcText | ToggleBtn | TargetText | DstLang | AddBtn */}
      <div className="grid grid-cols-[80px_1fr_60px_1fr_80px_auto] gap-2 items-end bg-gray-900 p-3 rounded-lg border border-gray-700">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Src Lang</label>
          <select
            title="Source Language"
            className="select select-bordered select-sm w-full"
            value={newEntry.sourceLang}
            onChange={(e) => setNewEntry({ ...newEntry, sourceLang: e.target.value })}
          >
            <option value="en">EN</option>
            <option value="ja">JP</option>
            <option value="ko">KR</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Source Text</label>
          <input
            title="Source Term"
            type="text"
            className="input input-bordered input-sm w-full"
            value={newEntry.sourceText}
            onChange={(e) => setNewEntry({ ...newEntry, sourceText: e.target.value })}
            placeholder="Ex: Ult"
          />
        </div>

        {/* Direction Toggle Button */}
        <div className="flex justify-center pb-1">
          <button
            className="btn btn-xs btn-ghost text-lg tooltip tooltip-bottom"
            data-tip={newEntry.bidirectional ? 'Apply Both Ways' : 'One Way Only'}
            onClick={toggleDirection}
            title={newEntry.bidirectional ? 'Bi-directional' : 'One-way'}
          >
            {newEntry.bidirectional ? '⇔' : '➜'}
          </button>
        </div>

        <div>
          <label className="text-xs text-gray-400 block mb-1">Target Text</label>
          <input
            title="Translated Term"
            type="text"
            className="input input-bordered input-sm w-full"
            value={newEntry.targetText}
            onChange={(e) => setNewEntry({ ...newEntry, targetText: e.target.value })}
            placeholder="Ex: アルティメット"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Dst Lang</label>
          <select
            title="Target Language"
            className="select select-bordered select-sm w-full"
            value={newEntry.targetLang}
            onChange={(e) => setNewEntry({ ...newEntry, targetLang: e.target.value })}
          >
            <option value="ja">JP</option>
            <option value="en">EN</option>
            <option value="ko">KR</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            className="btn btn-sm btn-primary"
            onClick={handleAdd}
            disabled={!newEntry.sourceText.trim() || !newEntry.targetText.trim()}
          >
            Add
          </button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-x-auto">
        <table className="table table-sm w-full bg-base-900 border border-gray-700">
          <thead>
            <tr className="bg-gray-800 text-gray-300">
              <th className="w-20">Order</th>
              <th className="w-20">Dir</th>
              <th>Source</th>
              <th className="w-8"></th>
              <th>Target</th>
              <th className="w-16">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-gray-500 py-4">
                  No entries. Add some terms above!
                </td>
              </tr>
            )}
            {entries.map((entry, idx) => (
              <tr key={entry.id} className="hover:bg-gray-800">
                <td>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs px-1"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0}
                      title="Move Up (Higher Priority)"
                    >
                      ⬆️
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs px-1"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === entries.length - 1}
                      title="Move Down"
                    >
                      ⬇️
                    </button>
                  </div>
                </td>
                <td className="font-mono text-xs text-gray-400">
                  {entry.sourceLang.toUpperCase()}
                  {entry.bidirectional ? '⇔' : '➜'}
                  {entry.targetLang.toUpperCase()}
                </td>
                <td className="font-bold">{entry.sourceText}</td>
                <td className="text-center text-gray-500">{entry.bidirectional ? '⇔' : '➜'}</td>
                <td className="text-blue-300">{entry.targetText}</td>
                <td>
                  <button
                    className="btn btn-xs btn-error btn-outline"
                    onClick={() => handleDelete(entry.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TSV Glossary Packs */}
      <div className="space-y-2 pt-4 border-t border-gray-700">
        <div className="flex items-center justify-between">
          <h4 className="text-md font-bold text-gray-300">Glossary Packs (ZIP / TSV)</h4>
          <label className="btn btn-sm btn-outline btn-primary">
            Import ZIP / TSV
            <input
              type="file"
              accept=".zip,.tsv,.txt"
              multiple
              className="hidden"
              onChange={handleImportPacks}
            />
          </label>
        </div>
        <p className="text-xs text-gray-400">
          A ZIP pack may bundle multiple TSV files. TSV header:{' '}
          <code>pos&#9;ja&#9;en&#9;ko&#9;zh</code> (aliases separated by <code>/</code>). Only terms
          found in each utterance are sent to the LLM. Packs are not used for Whisper prompts.
        </p>
        {importError && <div className="text-xs text-error">{importError}</div>}
        <table className="table table-sm w-full bg-base-900 border border-gray-700">
          <thead>
            <tr className="bg-gray-800 text-gray-300">
              <th className="w-16">On</th>
              <th>Pack</th>
              <th className="w-24">Rows</th>
              <th className="w-16">Action</th>
            </tr>
          </thead>
          <tbody>
            {packs.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-gray-500 py-4">
                  No packs imported.
                </td>
              </tr>
            )}
            {packs.map((pack) => (
              <tr key={pack.id} className="hover:bg-gray-800">
                <td>
                  <input
                    type="checkbox"
                    title="Enable pack"
                    className="toggle toggle-sm toggle-primary"
                    checked={pack.enabled}
                    onChange={() => togglePack(pack.id)}
                  />
                </td>
                <td className="font-bold">{pack.name}</td>
                <td className="text-gray-400">{pack.rowCount}</td>
                <td>
                  <button
                    className="btn btn-xs btn-error btn-outline"
                    onClick={() => deletePack(pack.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
