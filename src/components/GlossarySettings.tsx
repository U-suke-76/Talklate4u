import React, { useState } from "react";

export interface GlossaryEntry {
  id: string;
  sourceText: string;
  sourceLang: string;
  targetText: string;
  targetLang: string;
  bidirectional?: boolean;
}

interface GlossarySettingsProps {
  entries: GlossaryEntry[];
  onChange: (entries: GlossaryEntry[]) => void;
}

export const GlossarySettings: React.FC<GlossarySettingsProps> = ({
  entries,
  onChange,
}) => {
  const [newEntry, setNewEntry] = useState<Omit<GlossaryEntry, "id">>({
    sourceText: "",
    sourceLang: "en",
    targetText: "",
    targetLang: "ja",
    bidirectional: true, // Default to true as requested
  });

  const handleAdd = () => {
    if (!newEntry.sourceText.trim() || !newEntry.targetText.trim()) return;

    const entry: GlossaryEntry = {
      ...newEntry,
      id: crypto.randomUUID(),
    };

    onChange([...entries, entry]);
    setNewEntry({ ...newEntry, sourceText: "", targetText: "" }); // Reset text fields but keep langs
  };

  const handleDelete = (id: string) => {
    onChange(entries.filter((e) => e.id !== id));
  };

  const toggleDirection = () => {
    setNewEntry((prev) => ({ ...prev, bidirectional: !prev.bidirectional }));
  };

  return (
    <div className="p-4 space-y-4">
      <h4 className="text-md font-bold text-gray-300">
        Gaming Glossary / Dictionary
      </h4>
      <p className="text-sm text-gray-500">
        Define custom translations for game terms. Use <b>Bi-directional (⇔)</b>{" "}
        to apply the rule in both translation directions.
      </p>

      {/* Add New Entry Form */}
      {/* Grid Layout: SrcLang | SrcText | ToggleBtn | TargetText | DstLang | AddBtn */}
      <div className="grid grid-cols-[80px_1fr_60px_1fr_80px_auto] gap-2 items-end bg-gray-900 p-3 rounded-lg border border-gray-700">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Src Lang</label>
          <select
            title="Source Language"
            className="select select-bordered select-sm w-full"
            value={newEntry.sourceLang}
            onChange={(e) =>
              setNewEntry({ ...newEntry, sourceLang: e.target.value })
            }
          >
            <option value="en">EN</option>
            <option value="ja">JP</option>
            <option value="ko">KR</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">
            Source Text
          </label>
          <input
            title="Source Term"
            type="text"
            className="input input-bordered input-sm w-full"
            value={newEntry.sourceText}
            onChange={(e) =>
              setNewEntry({ ...newEntry, sourceText: e.target.value })
            }
            placeholder="Ex: Ult"
          />
        </div>

        {/* Direction Toggle Button */}
        <div className="flex justify-center pb-1">
          <button
            className="btn btn-xs btn-ghost text-lg tooltip tooltip-bottom"
            data-tip={
              newEntry.bidirectional ? "Apply Both Ways" : "One Way Only"
            }
            onClick={toggleDirection}
            title={newEntry.bidirectional ? "Bi-directional" : "One-way"}
          >
            {newEntry.bidirectional ? "⇔" : "➜"}
          </button>
        </div>

        <div>
          <label className="text-xs text-gray-400 block mb-1">
            Target Text
          </label>
          <input
            title="Translated Term"
            type="text"
            className="input input-bordered input-sm w-full"
            value={newEntry.targetText}
            onChange={(e) =>
              setNewEntry({ ...newEntry, targetText: e.target.value })
            }
            placeholder="Ex: アルティメット"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Dst Lang</label>
          <select
            title="Target Language"
            className="select select-bordered select-sm w-full"
            value={newEntry.targetLang}
            onChange={(e) =>
              setNewEntry({ ...newEntry, targetLang: e.target.value })
            }
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
            disabled={
              !newEntry.sourceText.trim() || !newEntry.targetText.trim()
            }
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
                <td colSpan={5} className="text-center text-gray-500 py-4">
                  No entries. Add some terms above!
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-800">
                <td className="font-mono text-xs text-gray-400">
                  {entry.sourceLang.toUpperCase()}
                  {entry.bidirectional ? "⇔" : "➜"}
                  {entry.targetLang.toUpperCase()}
                </td>
                <td className="font-bold">{entry.sourceText}</td>
                <td className="text-center text-gray-500">
                  {entry.bidirectional ? "⇔" : "➜"}
                </td>
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
    </div>
  );
};
