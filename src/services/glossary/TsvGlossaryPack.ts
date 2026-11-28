/**
 * TSV glossary pack support.
 *
 * Parses multilingual TSV glossaries (header: `pos\tja\ten\tko\tzh`, slash-separated aliases)
 * into language-pair maps and matches terms appearing in the input text.
 * Pure logic only (no Electron / Node APIs) so it can run in both main and renderer processes.
 */

import { unzipSync } from 'fflate';

export interface GlossaryPair {
  source: string;
  target: string;
}

/** Language-pair keyed map, e.g. `{ 'ko->ja': [{ source: '아키라', target: 'アキラ' }] }` */
export type GlossaryPairMap = Record<string, GlossaryPair[]>;

/**
 * Normalizes language strings to 2-letter codes ('ja', 'en', 'ko', 'zh').
 * Returns '' for unknown / auto.
 */
export function normalizePackLang(lang: string | undefined): string {
  if (!lang) return '';
  const lower = lang.trim().toLowerCase();
  if (lower === 'auto' || lower === 'unknown' || lower === 'und') return '';
  if (lower.startsWith('ja') || lower === 'japanese') return 'ja';
  if (lower.startsWith('en') || lower === 'english') return 'en';
  if (lower.startsWith('ko') || lower === 'korean') return 'ko';
  if (lower.startsWith('zh') || lower.includes('chinese')) return 'zh';
  return lower;
}

/** Splits slash-separated aliases. e.g. "アキラ/結城晶" => ["アキラ", "結城晶"] */
export function parseAliases(cell: string | undefined): string[] {
  if (!cell) return [];
  return cell
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parses one or more TSV contents into a language-pair map.
 * Every alias of the source language maps to the first (representative) term of the target language.
 * Earlier files / rows win on duplicates. Lists are sorted longest-first.
 */
export function parseTsvGlossary(contents: string | string[]): GlossaryPairMap {
  const list = Array.isArray(contents) ? contents : [contents];
  const pairMaps: Record<string, Map<string, string>> = {};

  for (const content of list) {
    if (!content) continue;
    const lines = content
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'));
    if (lines.length < 2) continue;

    const headers = lines[0].split('\t').map((h) => h.trim().toLowerCase());
    const hasPosCol = ['pos', 'category', 'type'].includes(headers[0]);
    const langStart = hasPosCol ? 1 : 0;
    const langHeaders = headers.slice(langStart).map((h) => normalizePackLang(h));

    for (const row of lines.slice(1)) {
      const cols = row.split('\t');
      const langData: Record<string, string[]> = {};
      langHeaders.forEach((lang, i) => {
        if (!lang) return;
        const aliases = parseAliases(cols[langStart + i]);
        if (aliases.length > 0) langData[lang] = aliases;
      });

      const langs = Object.keys(langData);
      for (const sLang of langs) {
        for (const tLang of langs) {
          if (sLang === tLang) continue;
          const key = `${sLang}->${tLang}`;
          const map = (pairMaps[key] ??= new Map<string, string>());
          const target = langData[tLang][0];
          for (const term of langData[sLang]) {
            if (!map.has(term)) map.set(term, target);
          }
        }
      }
    }
  }

  const result: GlossaryPairMap = {};
  for (const [key, map] of Object.entries(pairMaps)) {
    result[key] = Array.from(map, ([source, target]) => ({ source, target })).sort(
      (a, b) => b.source.length - a.source.length,
    );
  }
  return result;
}

/** Counts data rows (non-header, non-comment) in a TSV content. */
export function countTsvRows(content: string): number {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'));
  return Math.max(0, lines.length - 1);
}

/** Returns true when the first line looks like a tab-separated header. */
export function isTsvContent(content: string): boolean {
  const header = content.replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
  return header.includes('\t');
}

export interface ExtractedTsvFile {
  filename: string;
  content: string;
}

/**
 * Extracts all `.tsv` / `.txt` files from a ZIP archive (ignores `__MACOSX` and dotfiles).
 */
export function extractTsvFromZip(zip: Uint8Array): ExtractedTsvFile[] {
  const decoder = new TextDecoder('utf-8');
  const files: ExtractedTsvFile[] = [];
  for (const [filename, data] of Object.entries(unzipSync(zip))) {
    const base = filename.split('/').pop() || '';
    if (filename.includes('__MACOSX') || base.startsWith('.')) continue;
    if (!/\.(tsv|txt)$/i.test(base)) continue;
    files.push({ filename, content: decoder.decode(data) });
  }
  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}

/** Maximum number of injected terms according to input length (keeps prompts small). */
export function getMaxTermsByLength(textLength: number): number {
  if (textLength <= 10) return 2;
  if (textLength <= 30) return 4;
  if (textLength <= 60) return 5;
  return 6;
}

const HANGUL_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CompiledEntry {
  pair: GlossaryPair;
  lower: string;
  kind: 'ascii' | 'hangul' | 'cjk';
  regex?: RegExp;
}

function compileEntry(pair: GlossaryPair): CompiledEntry {
  const lower = pair.source.toLowerCase();
  if (/^[\w\s.,'-]+$/.test(pair.source)) {
    return {
      pair,
      lower,
      kind: 'ascii',
      regex: new RegExp(`(?:^|[^a-zA-Z0-9])(${escapeRegex(pair.source)})(?:$|[^a-zA-Z0-9])`, 'i'),
    };
  }
  return { pair, lower, kind: HANGUL_REGEX.test(pair.source) ? 'hangul' : 'cjk' };
}

function findSpan(entry: CompiledEntry, text: string, textLower: string) {
  if (!textLower.includes(entry.lower)) return null;

  if (entry.kind === 'ascii' && entry.regex) {
    const m = entry.regex.exec(text);
    if (!m) return null;
    const start = m.index + m[0].indexOf(m[1]);
    return { start, end: start + m[1].length };
  }

  if (entry.kind === 'hangul') {
    // Short Hangul terms (<=2 chars) must not start in the middle of a Hangul word.
    let from = 0;
    while (from < textLower.length) {
      const idx = textLower.indexOf(entry.lower, from);
      if (idx === -1) break;
      const before = idx > 0 ? text[idx - 1] : '';
      if (entry.pair.source.length >= 3 || !HANGUL_REGEX.test(before)) {
        return { start: idx, end: idx + entry.pair.source.length };
      }
      from = idx + 1;
    }
    return null;
  }

  const idx = textLower.indexOf(entry.lower);
  return idx >= 0 ? { start: idx, end: idx + entry.pair.source.length } : null;
}

/**
 * Longest-first, non-overlapping glossary matcher over a GlossaryPairMap.
 */
export class GlossaryPackMatcher {
  private readonly cache = new Map<string, CompiledEntry[]>();

  public constructor(private readonly map: GlossaryPairMap) {}

  private getCandidates(sourceLang: string, targetLang: string): CompiledEntry[] {
    const key = `${sourceLang || 'auto'}->${targetLang}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    let pairs: GlossaryPair[];
    if (sourceLang) {
      pairs = this.map[`${sourceLang}->${targetLang}`] || [];
    } else {
      // Unknown source: merge every list heading to the target language.
      const seen = new Set<string>();
      pairs = [];
      for (const [pairKey, list] of Object.entries(this.map)) {
        if (!pairKey.endsWith(`->${targetLang}`)) continue;
        for (const p of list) {
          const lower = p.source.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            pairs.push(p);
          }
        }
      }
      pairs.sort((a, b) => b.source.length - a.source.length);
    }

    const compiled = pairs.map(compileEntry);
    this.cache.set(key, compiled);
    return compiled;
  }

  public match(
    text: string,
    sourceLang: string | undefined,
    targetLang: string,
    maxTerms?: number,
  ): GlossaryPair[] {
    if (!text || !text.trim()) return [];
    const tgt = normalizePackLang(targetLang);
    if (!tgt) return [];
    const src = normalizePackLang(sourceLang);
    const limit = maxTerms ?? getMaxTermsByLength(text.length);

    const textLower = text.toLowerCase();
    const result: GlossaryPair[] = [];
    const ranges: Array<{ start: number; end: number }> = [];
    const seenTargets = new Set<string>();

    for (const entry of this.getCandidates(src, tgt)) {
      if (result.length >= limit) break;
      const span = findSpan(entry, text, textLower);
      if (!span) continue;
      const overlaps = ranges.some((r) => !(span.end <= r.start || span.start >= r.end));
      if (overlaps || seenTargets.has(entry.pair.target)) continue;
      result.push(entry.pair);
      ranges.push(span);
      seenTargets.add(entry.pair.target);
    }
    return result;
  }
}
