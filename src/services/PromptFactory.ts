export interface PromptResult {
  instruction: string;
  targetLang: string;
}

export class PromptFactory {
  // Common instructions
  private static readonly JA_INSTRUCTION = `Translate the input text into **JAPANESE**.
STRICT CONFIG:
1. **OUTPUT SCRIPT**: **JAPANESE ONLY** (Kanji/Kana).
2. **NO COPYING**: NEVER copy the source Korean text. If meanings are unclear, guess from context.
3. **FORBIDDEN**: ABSOLUTELY NO HANGUL CHARACTERS.
4. **TRANSLITERATION**: If a word is a proper noun (Name, Place) or unknown, **WRITE ITS SOUND IN KATAKANA**.
   - "김철수" -> "キム・チョルス"
   - "서울" -> "ソウル"
5. **HONORIFICS**: Translate "님", "씨" to "さん". NEVER leave "님" in the output.`;

  private static readonly KO_INSTRUCTION = `Translate the input Japanese text into **KOREAN**.
STRICT CONFIG:
1. **OUTPUT SCRIPT**: **HANGUL ONLY**.
2. **FORBIDDEN**: ABSOLUTELY NO JAPANESE CHARACTERS (Kanji, Hiragana, Katakana).
3. **TRANSLITERATION**: If a word is a proper noun (Name, Place) or unknown, **WRITE ITS SOUND IN HANGUL**.
   - "山田太郎" -> "야마다 타로"
   - "東京" -> " 도쿄"
4. **FILLERS**: Remove Japanese fillers ("あの", "えっと") or translate to Korean fillers ("저", "음").`;

  private static readonly EN_INSTRUCTION = 'Translate the input text into **ENGLISH**.';

  public static getPrompt(configuredTarget: string, detectedLanguage?: string): PromptResult {
    // 1. Explicit Single Target
    if (configuredTarget === 'ja') {
      return {
        targetLang: 'Japanese',
        instruction:
          'Translate the input text into **JAPANESE**.\nSTRICT RULE: The output must be 100% Japanese. If proper noun, TRANSLITERATE to Katakana. Do NOT use Hangul.',
      };
    }
    if (configuredTarget === 'ko') {
      return {
        targetLang: 'Korean',
        instruction:
          'Translate the input text into **KOREAN**.\nSTRICT RULE: The output must be 100% Korean. If proper noun, TRANSLITERATE to Hangul. ABSOLUTELY NO KANJI/KANA.',
      };
    }
    if (configuredTarget === 'en') {
      return {
        targetLang: 'English',
        instruction: this.EN_INSTRUCTION,
      };
    }

    // 2. Bi-directional / Auto
    const sourceLang = detectedLanguage || 'Unknown';

    // ja-ko (Default)
    if (configuredTarget === 'ja-ko' || configuredTarget === 'auto') {
      if (sourceLang === 'ja') {
        return { targetLang: 'Korean', instruction: this.KO_INSTRUCTION };
      } else {
        return { targetLang: 'Japanese', instruction: this.JA_INSTRUCTION };
      }
    }

    // ja-en
    if (configuredTarget === 'ja-en') {
      if (sourceLang === 'ja') {
        return { targetLang: 'English', instruction: this.EN_INSTRUCTION };
      } else {
        // En -> Ja
        return {
          targetLang: 'Japanese',
          instruction: 'Translate the input text into **JAPANESE**.',
        };
      }
    }

    // ko-en
    if (configuredTarget === 'ko-en') {
      if (sourceLang === 'ko') {
        return { targetLang: 'English', instruction: this.EN_INSTRUCTION };
      } else {
        // En -> Ko
        return {
          targetLang: 'Korean',
          instruction: `Translate the input text into **KOREAN**.
STRICT CONFIG:
1. **OUTPUT SCRIPT**: **HANGUL ONLY**.
2. **FORBIDDEN**: ABSOLUTELY NO ALPHABET CHARACTERS.
3. **TRANSLITERATION**: If a word is a proper noun (Name, Place) or unknown, **WRITE ITS SOUND IN HANGUL**.
   - "Smith" -> "스미스"
   - "iPhone" -> "아이폰"`,
        };
      }
    }

    // Fallback
    return {
      targetLang: 'Japanese',
      instruction:
        'Translate the input text into **JAPANESE**.\nSTRICT RULE: NO COPYING source text. Output MUST be 100% Japanese. If unclear, guess or exclude it.',
    };
  }
}
