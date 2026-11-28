import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import {
  parseTsvGlossary,
  countTsvRows,
  normalizePackLang,
  GlossaryPackMatcher,
  extractTsvFromZip,
  isTsvContent,
} from '../../src/services/glossary/TsvGlossaryPack';

const TSV = [
  'pos\tja\ten\tko\tzh',
  '# comment line',
  'noun\tアキラ/結城晶\tAkira / Akira Yuki\t아키라 / 유키 아키라\t结城晶',
  'noun\t確反/確定反撃\tpunish\t확반 / 딜캐\t确反',
  'noun\tレイ\tLei\t레이\t雷',
  'noun\tエルボー\tElbow\t엘보\t肘击',
  '',
].join('\n');

describe('TsvGlossaryPack', () => {
  it('normalizePackLang が各種表記を正規化する', () => {
    expect(normalizePackLang('Japanese')).toBe('ja');
    expect(normalizePackLang('ko')).toBe('ko');
    expect(normalizePackLang('Unknown')).toBe('');
    expect(normalizePackLang('auto')).toBe('');
  });

  it('countTsvRows がヘッダー・コメント・空行を除外して数える', () => {
    expect(countTsvRows(TSV)).toBe(4);
    expect(countTsvRows('\uFEFFpos\tja\n')).toBe(0);
  });

  it('全言語ペアを展開し、エイリアスを代表訳へマッピングする', () => {
    const map = parseTsvGlossary(TSV);
    expect(map['ko->ja']).toContainEqual({ source: '딜캐', target: '確反' });
    expect(map['ja->ko']).toContainEqual({ source: '結城晶', target: '아키라' });
    expect(map['en->ja']).toContainEqual({ source: 'Akira Yuki', target: 'アキラ' });
    // longest-first
    const lens = map['ko->ja'].map((p) => p.source.length);
    expect(lens).toEqual([...lens].sort((a, b) => b - a));
  });

  it('入力に含まれる用語のみを返す（最長一致・重複排除）', () => {
    const matcher = new GlossaryPackMatcher(parseTsvGlossary(TSV));
    expect(matcher.match('유키 아키라 딜캐 잘하네', 'ko', 'ja')).toEqual([
      { source: '유키 아키라', target: 'アキラ' },
      { source: '딜캐', target: '確反' },
    ]);
    expect(matcher.match('오늘 날씨 좋다', 'ko', 'ja')).toEqual([]);
  });

  it('短いハングル用語は単語途中で誤爆しない', () => {
    const matcher = new GlossaryPackMatcher(parseTsvGlossary(TSV));
    expect(matcher.match('에스컬레이터 탔어', 'ko', 'ja')).toEqual([]);
    expect(matcher.match('레이 강하다', 'ko', 'ja')).toEqual([{ source: '레이', target: 'レイ' }]);
  });

  it('英語は単語境界で大文字小文字を無視してマッチする', () => {
    const matcher = new GlossaryPackMatcher(parseTsvGlossary(TSV));
    expect(matcher.match('nice ELBOW!', 'en', 'ja')).toEqual([
      { source: 'Elbow', target: 'エルボー' },
    ]);
    expect(matcher.match('elbowroom', 'en', 'ja')).toEqual([]);
  });

  it('ソース言語不明時はターゲット向けの全ペアから探索する', () => {
    const matcher = new GlossaryPackMatcher(parseTsvGlossary(TSV));
    expect(
      matcher
        .match('아키라 punish', 'Unknown', 'ja')
        .map((p) => p.target)
        .sort(),
    ).toEqual(['アキラ', '確反'].sort());
  });

  it('入力長に応じて注入件数を制限する', () => {
    const matcher = new GlossaryPackMatcher(parseTsvGlossary(TSV));
    expect(matcher.match('아키라 딜캐 엘보', 'ko', 'ja')).toHaveLength(2);
  });

  it('ZIP から TSV/TXT のみを抽出し、__MACOSX やドットファイルを除外する', () => {
    const enc = new TextEncoder();
    const zip = zipSync({
      'pack/game_vf.tsv': enc.encode(TSV),
      'pack/slang.txt': enc.encode('pos\tja\tko\nphrase\tナイス\t나이스'),
      'pack/readme.md': enc.encode('# readme'),
      '__MACOSX/pack/._game_vf.tsv': enc.encode('junk'),
      'pack/.hidden.tsv': enc.encode('junk'),
    });
    const files = extractTsvFromZip(zip);
    expect(files.map((f) => f.filename)).toEqual(['pack/game_vf.tsv', 'pack/slang.txt']);
    expect(files.every((f) => isTsvContent(f.content))).toBe(true);

    const matcher = new GlossaryPackMatcher(parseTsvGlossary(files.map((f) => f.content)));
    expect(
      matcher
        .match('나이스 아키라', 'ko', 'ja')
        .map((p) => p.target)
        .sort(),
    ).toEqual(['アキラ', 'ナイス'].sort());
  });

  it('isTsvContent がタブ区切りヘッダーを判定する', () => {
    expect(isTsvContent('\uFEFFpos\tja\tko')).toBe(true);
    expect(isTsvContent('just text')).toBe(false);
  });
});
