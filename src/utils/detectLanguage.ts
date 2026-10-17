/**
 * テキストベースの言語検出ユーティリティ
 * francライブラリを使用してテキストの言語を検出
 */
import { franc } from 'franc';

// ISO 639-3 (franc) から ISO 639-1 (Whisper) へのマッピング
// Whisperがサポートする主要言語のみ
const ISO_639_3_TO_1: Record<string, string> = {
  jpn: 'ja',
  kor: 'ko',
  eng: 'en',
  zho: 'zh',
  cmn: 'zh', // Mandarin Chinese
  yue: 'zh', // Cantonese
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  por: 'pt',
  rus: 'ru',
  ara: 'ar',
  hin: 'hi',
  tha: 'th',
  vie: 'vi',
  ind: 'id',
  nld: 'nl',
  pol: 'pl',
  tur: 'tr',
  ukr: 'uk',
};

// 将来的にISO 639-1からISO 639-3への逆変換が必要な場合はここに追加

// Script detection patterns for short utterances
const HANGUL_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const KANA_REGEX = /[\u3040-\u309F\u30A0-\u30FF]/;

/**
 * テキストの言語を検出
 * @param text 検出対象のテキスト
 * @returns ISO 639-1 言語コード (例: 'ja', 'ko', 'en') または 'und' (不明)
 */
export function detectLanguage(text: string): string {
  const trimmed = text?.trim();
  if (!trimmed) {
    return 'und';
  }

  // 1. 文字種（Unicodeブロック）による高速・短文対応判定
  // ハングルが含まれる場合は韓国語、ひらがな・カタカナが含まれる場合は日本語と優先判定
  const hasHangul = HANGUL_REGEX.test(trimmed);
  const hasKana = KANA_REGEX.test(trimmed);

  if (hasHangul && !hasKana) {
    return 'ko';
  }
  if (hasKana && !hasHangul) {
    return 'ja';
  }

  // 2. 統計ベースの判定 (franc) は10文字未満だと精度が低いため足切り
  if (trimmed.length < 10) {
    // 短文でASCII英字のみで構成されている場合は英語と判定
    if (/^[a-zA-Z0-9\s.,?!'"-]+$/.test(trimmed) && /[a-zA-Z]{2,}/.test(trimmed)) {
      return 'en';
    }
    return 'und';
  }

  const iso639_3 = franc(trimmed, { minLength: 3 });

  if (iso639_3 === 'und') {
    return 'und';
  }

  return ISO_639_3_TO_1[iso639_3] || 'und';
}

/**
 * Whisperの言語検出とテキスト言語検出を比較し、より信頼性の高い言語を返す
 * @param text 認識されたテキスト
 * @param whisperLang Whisperが検出した言語 (ISO 639-1)
 * @returns 最終的な言語コード (ISO 639-1)
 */
export function resolveLanguage(text: string): string {
  const textLang = detectLanguage(text);

  // テキストから言語を検出できなかった場合
  if (textLang === 'und') {
    return 'und';
  }

  // テキスト検出を常に優先
  return textLang;
}

/**
 * テキストが特定の言語であるかを確認
 */
export function isLanguage(text: string, expectedLang: string): boolean {
  const detected = detectLanguage(text);
  return detected === expectedLang;
}
