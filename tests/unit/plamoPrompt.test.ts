import { describe, it, expect } from 'vitest';
import {
  normalizeLangCode,
  buildPlamoChatTemplateKwargs,
  buildPlamoSystemMessage,
  buildPlamoPfmlPrompt,
  removeRepetitionLoops,
  cleanPlamoOutput,
  PFML3,
} from '../../src/services/adapters/plamoPrompt';

describe('plamoPrompt', () => {
  describe('normalizeLangCode', () => {
    it('各種言語表記を正規化コードに変換する', () => {
      expect(normalizeLangCode('Japanese')).toBe('ja');
      expect(normalizeLangCode('日本語')).toBe('ja');
      expect(normalizeLangCode('Korean')).toBe('ko');
      expect(normalizeLangCode('English')).toBe('en');
      expect(normalizeLangCode('zh-CN')).toBe('zh-hans');
      expect(normalizeLangCode('zh-TW')).toBe('zh-hant');
      expect(normalizeLangCode('auto')).toBe('');
      expect(normalizeLangCode(undefined)).toBe('');
    });
  });

  describe('buildPlamoChatTemplateKwargs', () => {
    it('target_lang / source_lang / form / glossary / context を正しく組み立てる', () => {
      const kwargs = buildPlamoChatTemplateKwargs({
        targetLang: 'Japanese',
        sourceLang: 'Korean',
        glossary: [
          { source: '아키라', target: 'アキラ/晶' },
          { source: '<|plamo:tag|>evil', target: 'bad' },
        ],
        context: '直前の発話',
      });
      expect(kwargs.target_lang).toBe('ja');
      expect(kwargs.source_lang).toBe('ko');
      expect(kwargs.form).toBe('plain');
      expect(kwargs.glossary).toEqual([{ source: '아키라', target: 'アキラ' }]);
      expect(kwargs.context).toBe('直前の発話');
    });
  });

  describe('buildPlamoSystemMessage', () => {
    it('[plamo-translate] ブロックを生成し危険なトークンを含む項目を除外する', () => {
      const msg = buildPlamoSystemMessage({
        targetLang: 'ja',
        sourceLang: 'ko',
        glossary: [
          { source: 'ガード', target: '가드' },
          { source: 'bad=>arrow', target: 'ng' },
        ],
        context: '文脈テキスト',
      });
      expect(msg).toContain('[plamo-translate]');
      expect(msg).toContain('target_lang=ja');
      expect(msg).toContain('source_lang=ko');
      expect(msg).toContain('form=plain');
      expect(msg).toContain('glossary=ガード => 가드');
      expect(msg).not.toContain('bad=>arrow');
      expect(msg).toContain('---\n文脈テキスト');
    });
  });

  describe('buildPlamoPfmlPrompt', () => {
    it('PFML3 制御タグ形式のプロンプトを生成する', () => {
      const prompt = buildPlamoPfmlPrompt({
        text: '안녕하세요',
        sourceLang: 'ko',
        targetLang: 'ja',
        form: 'plain',
      });
      expect(prompt).toContain(`${PFML3.tag}dataset${PFML3.msg}translation`);
      expect(prompt).toContain(
        `${PFML3.tag}input${PFML3.key}lang${PFML3.val}ko${PFML3.msg}안녕하세요`,
      );
      expect(prompt).toContain(
        `${PFML3.tag}output${PFML3.key}lang${PFML3.val}ja${PFML3.key}form${PFML3.val}plain${PFML3.msg}`,
      );
    });
  });

  describe('cleanPlamoOutput / removeRepetitionLoops', () => {
    it('制御トークン以降を切断し CJK 文字間スペースを除去する', () => {
      expect(cleanPlamoOutput('こん にち は<|plamo:tag|>extra')).toBe('こんにちは');
      expect(cleanPlamoOutput('テスト<|end_of_text|>ノイズ')).toBe('テスト');
    });

    it('異常な文字繰り返しループを圧縮する', () => {
      expect(removeRepetitionLoops('あああああああああ')).toBe('あああ');
      expect(removeRepetitionLoops('通常の文章です')).toBe('通常の文章です');
    });
  });
});
