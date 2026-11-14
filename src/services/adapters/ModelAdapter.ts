import {
  buildPlamoChatTemplateKwargs,
  cleanPlamoOutput,
  normalizeLangCode,
  PLAMO_STOP_TOKENS,
} from '../wllama/plamoPrompt';

export interface ConversationHistoryItem {
  original: string;
  translated: string;
  timestamp: number;
}

export interface GlossaryPair {
  source: string;
  target: string;
}

export interface AdapterInput {
  text: string;
  sourceLang?: string;
  targetLangName: string;
  systemPrompt: string;
  history: ConversationHistoryItem[];
  glossary: GlossaryPair[];
}

export interface AdapterRequestPayload {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stop?: string[];
  chat_template_kwargs?: Record<string, unknown>;
}

export interface IModelAdapter {
  readonly family: 'plamo' | 'qwen' | 'gemma' | 'gpt-oss' | 'standard';
  buildRequest(input: AdapterInput): AdapterRequestPayload;
  cleanOutput(rawContent: string, inputText: string): string;
}

function buildMultiTurnMessages(
  systemPrompt: string,
  history: ConversationHistoryItem[],
  text: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];
  for (const turn of history) {
    messages.push({ role: 'user', content: turn.original });
    messages.push({ role: 'assistant', content: turn.translated });
  }
  messages.push({ role: 'user', content: text });
  return messages;
}

function formatGemmaLangDesc(lang?: string): string {
  const code = normalizeLangCode(lang);
  if (code === 'ja') return 'Japanese (ja)';
  if (code === 'en') return 'English (en)';
  if (code === 'ko') return 'Korean (ko)';
  if (code === 'zh-hans') return 'Chinese (zh-Hans)';
  if (code === 'zh-hant') return 'Chinese (zh-Hant)';
  return lang || 'Japanese (ja)';
}

/**
 * 1. PLaMo 3 Translate Adapter (0.8B / 2B / 8B / 31B)
 * Works identically on Local WebGPU (Wllama) and Remote OpenAI-compatible servers (e.g., Colab llama-server).
 */
export class PlamoAdapter implements IModelAdapter {
  public readonly family = 'plamo' as const;

  public buildRequest(input: AdapterInput): AdapterRequestPayload {
    const targetCode = normalizeLangCode(input.targetLangName) || 'ja';
    const sourceCode = normalizeLangCode(input.sourceLang);
    const contextText = input.history
      .slice(-4)
      .map((turn) => turn.original.trim())
      .filter(Boolean)
      .join('\n');

    const kwargs = buildPlamoChatTemplateKwargs({
      targetLang: targetCode,
      sourceLang: sourceCode || undefined,
      context: contextText || undefined,
      glossary: input.glossary.length > 0 ? input.glossary : undefined,
      form: 'plain',
    });

    return {
      messages: [{ role: 'user', content: input.text }],
      stop: PLAMO_STOP_TOKENS,
      chat_template_kwargs: kwargs,
    };
  }

  public cleanOutput(rawContent: string, inputText: string): string {
    let cleaned = cleanPlamoOutput(rawContent);
    const strippedInput = inputText.replace(/[\s.?!,;:。、．！？・ー～〜…]+/gu, '');
    if (strippedInput.length <= 2 && cleaned.length > 20) {
      console.warn(
        `[PlamoAdapter] Discarded disproportionate output for short input "${inputText}" -> "${cleaned}"`,
      );
      cleaned = '';
    }
    return cleaned;
  }
}

/**
 * 2. Qwen Adapter (Qwen 2.5 / Qwen 3)
 * Suppresses thinking mode via `/no_think` directive and strips residual `<think>` blocks.
 * Note: Does NOT send `chat_template_kwargs` because cloud APIs like Groq reject unknown top-level properties with HTTP 400.
 */
export class QwenAdapter implements IModelAdapter {
  public readonly family = 'qwen' as const;

  public buildRequest(input: AdapterInput): AdapterRequestPayload {
    const noThinkSystemPrompt = input.systemPrompt.startsWith('/no_think')
      ? input.systemPrompt
      : `/no_think\n${input.systemPrompt}`;

    return {
      messages: buildMultiTurnMessages(noThinkSystemPrompt, input.history, input.text),
    };
  }

  public cleanOutput(rawContent: string): string {
    return rawContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  }
}

/**
 * 3. Gemma Adapter (Gemma 2 / Gemma 3 / Gemma 4 / TranslateGemma)
 * Gemma templates do not natively use a `system` role; instructions, context, and glossary are structured in a single `user` turn.
 */
export class GemmaAdapter implements IModelAdapter {
  public readonly family = 'gemma' as const;

  public buildRequest(input: AdapterInput): AdapterRequestPayload {
    const targetDesc = formatGemmaLangDesc(input.targetLangName);
    const sourceDesc =
      input.sourceLang && input.sourceLang !== 'Unknown' && input.sourceLang !== 'auto'
        ? formatGemmaLangDesc(input.sourceLang)
        : null;
    const directionText = sourceDesc
      ? `from ${sourceDesc} into ${targetDesc}`
      : `into ${targetDesc}`;

    let prompt =
      `You are a professional real-time stream subtitle translator.\n` +
      `Translate the spoken utterance ${directionText}. Naturally correct obvious speech-to-text homophone typos based on context.\n` +
      `The entire output MUST be strictly in ${targetDesc}. Output ONLY the translated text without any explanations, notes, or prefixes.`;

    const recentContext = input.history
      .slice(-4)
      .map((turn) => `${turn.original} -> ${turn.translated}`)
      .join(' | ');
    if (recentContext) {
      prompt += `\n\nRecent Context (for reference only; do NOT re-translate): ${recentContext}`;
    }

    if (input.glossary.length > 0) {
      const glossaryLines = input.glossary.map((g) => `- ${g.source} => ${g.target}`).join('\n');
      prompt += `\n\nGLOSSARY (Strictly use these translations):\n${glossaryLines}`;
    }

    const targetPrefix = input.targetLangName || 'Translation';
    const userContent = `${prompt}\n\nInput:\n${input.text}\n\n${targetPrefix}:`;

    return {
      messages: [{ role: 'user', content: userContent }],
    };
  }

  public cleanOutput(rawContent: string): string {
    let cleaned = rawContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
    cleaned = cleaned.replace(/^(?:Japanese|English|Korean|Translation)\s*:\s*/i, '').trim();
    return cleaned;
  }
}

/**
 * 4. GPT-OSS Adapter (openai/gpt-oss-120b, openai/gpt-oss-20b, etc.)
 * Prevents Harmony special token (`<|...|>` ) leakage via stop sequence.
 */
export class GptOssAdapter implements IModelAdapter {
  public readonly family = 'gpt-oss' as const;

  public buildRequest(input: AdapterInput): AdapterRequestPayload {
    return {
      messages: buildMultiTurnMessages(input.systemPrompt, input.history, input.text),
      stop: ['<|'],
    };
  }

  public cleanOutput(rawContent: string): string {
    let cleaned = rawContent;
    const tagIdx = cleaned.indexOf('<|');
    if (tagIdx !== -1) {
      cleaned = cleaned.slice(0, tagIdx);
    }
    return cleaned.trim();
  }
}

/**
 * 5. Standard Chat Adapter (Llama 3.x / 4, GPT-4o, Mixtral, etc.)
 * Clean standard system + multi-turn user/assistant history without model-specific hacks.
 */
export class StandardChatAdapter implements IModelAdapter {
  public readonly family = 'standard' as const;

  public buildRequest(input: AdapterInput): AdapterRequestPayload {
    return {
      messages: buildMultiTurnMessages(input.systemPrompt, input.history, input.text),
    };
  }

  public cleanOutput(rawContent: string): string {
    return rawContent.trim();
  }
}

const plamoAdapter = new PlamoAdapter();
const qwenAdapter = new QwenAdapter();
const gemmaAdapter = new GemmaAdapter();
const gptOssAdapter = new GptOssAdapter();
const standardAdapter = new StandardChatAdapter();

export function resolveModelAdapter(modelName?: string, provider?: string): IModelAdapter {
  if (provider === 'plamo-local') {
    return plamoAdapter;
  }

  const lower = (modelName || '').trim().toLowerCase();
  if (lower.includes('plamo')) {
    return plamoAdapter;
  }
  if (lower.includes('qwen')) {
    return qwenAdapter;
  }
  if (lower.includes('gemma')) {
    return gemmaAdapter;
  }
  if (lower.includes('gpt-oss')) {
    return gptOssAdapter;
  }
  return standardAdapter;
}
