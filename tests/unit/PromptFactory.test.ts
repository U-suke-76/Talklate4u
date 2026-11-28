import { describe, it, expect } from 'vitest';
import { PromptFactory } from '../../src/services/PromptFactory';

describe('PromptFactory', () => {
  it('単一ターゲット指定 (ja / ko / en) で正しい言語を返す', () => {
    expect(PromptFactory.getPrompt('ja').targetLangCode).toBe('ja');
    expect(PromptFactory.getPrompt('ko').targetLangCode).toBe('ko');
    expect(PromptFactory.getPrompt('en').targetLangCode).toBe('en');
  });

  it('ja-ko / auto は日本語入力時に韓国語、それ以外は日本語へ翻訳指示を返す', () => {
    const jaToKo = PromptFactory.getPrompt('ja-ko', 'ja');
    expect(jaToKo.targetLangCode).toBe('ko');
    expect(jaToKo.targetLang).toBe('Korean');

    const koToJa = PromptFactory.getPrompt('auto', 'ko');
    expect(koToJa.targetLangCode).toBe('ja');
    expect(koToJa.targetLang).toBe('Japanese');
  });

  it('ja-en は日本語入力時に英語、それ以外は日本語を返す', () => {
    expect(PromptFactory.getPrompt('ja-en', 'ja').targetLangCode).toBe('en');
    expect(PromptFactory.getPrompt('ja-en', 'en').targetLangCode).toBe('ja');
  });

  it('ko-en は韓国語入力時に英語、それ以外は韓国語を返す', () => {
    expect(PromptFactory.getPrompt('ko-en', 'ko').targetLangCode).toBe('en');
    expect(PromptFactory.getPrompt('ko-en', 'en').targetLangCode).toBe('ko');
  });

  it('未知のターゲット指定時は日本語フォールバックを返す', () => {
    const fallback = PromptFactory.getPrompt('unknown-target');
    expect(fallback.targetLangCode).toBe('ja');
  });
});
