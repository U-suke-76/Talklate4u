import type { GlossaryEntry, GlossaryPack } from '../../types/config';
import { GlossaryPackMatcher, parseTsvGlossary } from './TsvGlossaryPack';

/**
 * Resolves user glossary entries and enabled TSV glossary packs for the active
 * translation direction, caching the compiled pack matcher until packs change.
 */
export class GlossaryResolver {
  private packMatcher: GlossaryPackMatcher | null = null;
  private packMatcherKey = '';

  /**
   * Resolves glossary pairs matching the current translation direction (`sourceLang` -> `targetLangCode`).
   * If `filterByInputText` is provided, only entries appearing in the input text (case-insensitive) are returned.
   */
  private resolveMatchedGlossaryEntries(
    glossary: GlossaryEntry[] | undefined,
    sourceLang: string,
    targetLangCode: string,
    filterByInputText?: string,
  ): Array<{ source: string; target: string }> {
    const entries = glossary || [];
    if (entries.length === 0) return [];

    const lowerText = filterByInputText?.toLowerCase();
    const matched: Array<{ source: string; target: string }> = [];
    const seen = new Set<string>();

    for (const entry of entries) {
      const isUniMatch =
        (entry.sourceLang === sourceLang || sourceLang === 'Unknown') &&
        entry.targetLang === targetLangCode;

      const isBiMatchReversed =
        entry.bidirectional &&
        (entry.targetLang === sourceLang || sourceLang === 'Unknown') &&
        entry.sourceLang === targetLangCode;

      let pair: { source: string; target: string } | null = null;
      if (isUniMatch) {
        pair = { source: entry.sourceText, target: entry.targetText };
      } else if (isBiMatchReversed) {
        pair = { source: entry.targetText, target: entry.sourceText };
      }

      if (!pair || !pair.source) continue;
      if (lowerText !== undefined && !lowerText.includes(pair.source.toLowerCase())) {
        continue;
      }

      const key = `${pair.source}=>${pair.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        matched.push(pair);
      }
    }

    return matched;
  }

  /**
   * Returns a matcher built from enabled TSV glossary packs (rebuilt only when packs change).
   */
  private getPackMatcher(packs: GlossaryPack[] | undefined): GlossaryPackMatcher | null {
    const enabled = (packs || []).filter((p) => p.enabled && p.contents?.length > 0);
    if (enabled.length === 0) return null;

    const key = enabled
      .map((p) => `${p.id}:${p.contents.reduce((n, c) => n + c.length, 0)}`)
      .join('|');
    if (!this.packMatcher || this.packMatcherKey !== key) {
      this.packMatcher = new GlossaryPackMatcher(
        parseTsvGlossary(enabled.flatMap((p) => p.contents)),
      );
      this.packMatcherKey = key;
    }
    return this.packMatcher;
  }

  /**
   * Combines user glossary entries with TSV pack terms found in the input text.
   * User entries take priority; pack terms are injected only when they appear in `text`.
   */
  public resolveCombined(
    glossary: GlossaryEntry[] | undefined,
    packs: GlossaryPack[] | undefined,
    sourceLang: string,
    targetLangCode: string,
    text: string | undefined,
    filterUserEntriesByText: boolean,
  ): Array<{ source: string; target: string }> {
    const user = this.resolveMatchedGlossaryEntries(
      glossary,
      sourceLang,
      targetLangCode,
      filterUserEntriesByText ? text : undefined,
    );
    if (!text) return user;

    const matcher = this.getPackMatcher(packs);
    if (!matcher) return user;

    const seen = new Set(user.map((p) => p.source.toLowerCase()));
    const packTerms = matcher
      .match(text, sourceLang, targetLangCode)
      .filter((p) => !seen.has(p.source.toLowerCase()));
    return [...user, ...packTerms];
  }

  public formatGlossaryBlock(
    glossary: GlossaryEntry[] | undefined,
    packs: GlossaryPack[] | undefined,
    sourceLang: string,
    targetLangCode: string,
    text?: string,
  ): string {
    const matched = this.resolveCombined(glossary, packs, sourceLang, targetLangCode, text, false);
    if (matched.length === 0) return '';

    const lines = matched.map((pair) => `- ${pair.source}: ${pair.target}`);
    return `Use the following term definitions strictly:\n` + lines.join('\n');
  }
}
