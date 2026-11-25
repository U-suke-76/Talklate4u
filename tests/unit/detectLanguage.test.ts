import { describe, it, expect } from 'vitest';
import { detectLanguage, resolveLanguage, isLanguage } from '../../src/utils/detectLanguage';

describe('detectLanguage', () => {
  it('空文字・空白のみは und を返す', () => {
    expect(detectLanguage('')).toBe('und');
    expect(detectLanguage('   ')).toBe('und');
  });

  it('短文の日本語（かな含む）を ja と判定する', () => {
    expect(detectLanguage('こんにちは')).toBe('ja');
    expect(detectLanguage('テスト')).toBe('ja');
  });

  it('短文の韓国語（ハングル含む）を ko と判定する', () => {
    expect(detectLanguage('안녕하세요')).toBe('ko');
    expect(detectLanguage('감사합니다')).toBe('ko');
  });

  it('10文字未満の英字のみを en と判定する', () => {
    expect(detectLanguage('Hello!')).toBe('en');
    expect(detectLanguage('OK')).toBe('en');
  });

  it('10文字未満の数字・記号のみは und を返す', () => {
    expect(detectLanguage('12345')).toBe('und');
    expect(detectLanguage('...')).toBe('und');
  });

  it('10文字以上の英文を franc で en と判定する', () => {
    expect(
      detectLanguage('Hello everyone, thank you very much for watching this live stream today.'),
    ).toBe('en');
  });

  it('resolveLanguage と isLanguage が detectLanguage に連動する', () => {
    expect(resolveLanguage('おはよう')).toBe('ja');
    expect(resolveLanguage('   ')).toBe('und');
    expect(isLanguage('안녕하세요', 'ko')).toBe(true);
    expect(isLanguage('안녕하세요', 'ja')).toBe(false);
  });
});
