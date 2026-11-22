import OpenAI, { ClientOptions } from 'openai';

import * as path from 'path';
import * as fs from 'fs';

import { ConfigManager } from '../managers/ConfigManager';
import { OverlayServer } from '../server/OverlayServer';
import Handlebars from 'handlebars';

import { PathUtils } from '../utils/PathUtils';
import { PromptFactory } from './PromptFactory';
import { resolveModelAdapter } from './adapters/ModelAdapter';

interface ConversationTurn {
  original: string;
  translated: string;
  timestamp: number;
}

export class TranslationService {
  private openaiClient: OpenAI | null = null;
  private overlayServer: OverlayServer;
  private promptTemplate: HandlebarsTemplateDelegate | null = null;
  private currentModelIndex = 0;
  private subtitleIdCounter = 1;
  private history: ConversationTurn[] = [];
  private readonly MAX_HISTORY_TURNS = 6;
  private readonly HISTORY_TTL_MS = 2 * 60 * 1000; // 2 minutes context window

  // Combined patterns from main.ts
  private readonly NOISE_PATTERNS = [
    // System / Hallucination tags
    /^\[.*\]$/, // [BLANK_AUDIO], [MUSIC], etc.
    /^\(.*\)$/, // (音楽), (視聴中), etc.
    /^（.*）$/, // Full-width parenthesis

    // Symbols only
    /^[\s.?!,;:。、．！？・]+$/, // ... or ? or ! only
    /^[\p{P}\s]+$/u, // Unicode punctuation only

    // Laughs / Short noise
    /^[wWｗＷ]+$/,
    /^[a-zA-Z]$/,

    // Sound effects
    /^\*.*\*$/,
  ];

  private onLog: (msg: string) => void;
  private localTranslator:
    | ((params: {
        model: string;
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        stop?: string[];
        chat_template_kwargs?: Record<string, unknown>;
        fallbackPrompt?: string;
        temperature?: number;
      }) => Promise<string>)
    | null = null;

  constructor(overlayServer: OverlayServer, onLog: (msg: string) => void) {
    this.overlayServer = overlayServer;
    this.onLog = onLog;

    // Pre-compile template if possible or load on demand
    this.loadSystemPromptTemplate();
  }

  public setLocalTranslator(
    fn: (params: {
      model: string;
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      stop?: string[];
      chat_template_kwargs?: Record<string, unknown>;
      fallbackPrompt?: string;
      temperature?: number;
    }) => Promise<string>,
  ) {
    this.localTranslator = fn;
  }

  private getLLMClient(): OpenAI | null {
    const config = ConfigManager.getInstance().getConfig();
    const { provider, apiKey, baseUrl } = config.llm;

    if (!this.openaiClient) {
      const clientConfig: ClientOptions = {
        apiKey: apiKey || 'dummy',
        dangerouslyAllowBrowser: false,
      };

      if (provider === 'groq') {
        clientConfig.baseURL = 'https://api.groq.com/openai/v1';
      } else if (provider === 'openai') {
        if (baseUrl && baseUrl.trim().length > 0) {
          let normalized = baseUrl.trim().replace(/\/+$/, '');
          if (normalized.endsWith('/chat/completions')) {
            normalized = normalized.slice(0, -'/chat/completions'.length);
          }
          if (!normalized.endsWith('/v1') && !normalized.includes('/v1/')) {
            normalized = `${normalized}/v1`;
          }
          clientConfig.baseURL = normalized;
        }
      }

      this.openaiClient = new OpenAI(clientConfig);
      console.log(
        `[TranslationService] LLM Client initialized (Provider: ${provider}, BaseURL: ${clientConfig.baseURL || 'Default OpenAI'})`,
      );
    }
    return this.openaiClient;
  }

  public resetClient() {
    this.openaiClient = null;
    this.history = [];
  }

  private getActiveHistory(): ConversationTurn[] {
    const now = Date.now();
    this.history = this.history.filter((turn) => now - turn.timestamp <= this.HISTORY_TTL_MS);
    return this.history;
  }

  private pushHistory(original: string, translated: string) {
    this.getActiveHistory();
    this.history.push({
      original,
      translated,
      timestamp: Date.now(),
    });
    if (this.history.length > this.MAX_HISTORY_TURNS) {
      this.history.shift();
    }
  }

  private isNoiseOrHallucination(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return true;

    return this.NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
  }

  private loadSystemPromptTemplate() {
    const PROMPT_PATH = path.join(PathUtils.getResourcesPath(), 'system_prompt.txt');
    if (fs.existsSync(PROMPT_PATH)) {
      try {
        const source = fs.readFileSync(PROMPT_PATH, 'utf-8');
        this.promptTemplate = Handlebars.compile(source);
      } catch (e) {
        console.error('[TranslationService] Failed to read system_prompt.txt:', e);
      }
    }
  }

  /**
   * Resolves glossary pairs matching the current translation direction (`sourceLang` -> `targetLangCode`).
   * If `filterByInputText` is provided, only entries appearing in the input text (case-insensitive) are returned.
   */
  private resolveMatchedGlossaryEntries(
    sourceLang: string,
    targetLangCode: string,
    filterByInputText?: string,
  ): Array<{ source: string; target: string }> {
    const config = ConfigManager.getInstance().getConfig();
    const glossary = config.glossary || [];
    if (glossary.length === 0) return [];

    const lowerText = filterByInputText?.toLowerCase();
    const matched: Array<{ source: string; target: string }> = [];
    const seen = new Set<string>();

    for (const entry of glossary) {
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

  private getGlossaryBlock(sourceLang: string, targetLangCode: string): string {
    const matched = this.resolveMatchedGlossaryEntries(sourceLang, targetLangCode);
    if (matched.length === 0) return '';

    const lines = matched.map((pair) => `- ${pair.source}: ${pair.target}`);
    return `Use the following term definitions strictly:\n` + lines.join('\n');
  }

  private getSystemPrompt(detectedLanguage?: string): string {
    if (!this.promptTemplate) {
      this.loadSystemPromptTemplate();
      if (!this.promptTemplate) return 'You are a professional translator.'; // Fallback
    }

    const config = ConfigManager.getInstance().getConfig();
    const configuredTarget = config.translation?.targetLang || 'auto';

    const { instruction, targetLang, targetLangCode } = PromptFactory.getPrompt(
      configuredTarget,
      detectedLanguage,
    );
    const sourceLang = detectedLanguage || 'Unknown';
    const glossaryBlock = this.getGlossaryBlock(sourceLang, targetLangCode);

    return this.promptTemplate({
      INSTRUCTION: instruction,
      SOURCE_LANG: sourceLang,
      TARGET_LANG: targetLang,
      GLOSSARY: glossaryBlock,
    });
  }

  private getPlamoGlossary(
    text: string,
    detectedLanguage?: string,
  ): Array<{ source: string; target: string }> {
    const config = ConfigManager.getInstance().getConfig();
    const configuredTarget = config.translation?.targetLang || 'auto';
    const { targetLangCode } = PromptFactory.getPrompt(configuredTarget, detectedLanguage);
    const sourceLang = detectedLanguage || 'Unknown';

    return this.resolveMatchedGlossaryEntries(sourceLang, targetLangCode, text);
  }

  public async translate(
    text: string,
    detectedLanguage?: string,
  ): Promise<{ text?: string | null; error?: string }> {
    if (!text.trim()) return { text: '' };

    if (this.isNoiseOrHallucination(text)) {
      console.log(`[TranslationService] Filtered/Hallucination ignored: "${text}"`);
      return { text: null };
    }

    // Stage 1 Overlay Broadcast: Immediately show recognized original text with pending indicator
    const subtitleId = `sub-${Date.now()}-${this.subtitleIdCounter++}`;
    this.overlayServer.broadcast('translation', {
      id: subtitleId,
      original: text,
      translation: '...',
      pending: true,
    });

    const config = ConfigManager.getInstance().getConfig();
    const currentModel = config.llm?.model || 'auto';
    const isLocalPlamo = config.llm.provider === 'plamo-local';
    const isGroq = config.llm.provider === 'groq';
    const isAuto = currentModel === 'auto' && isGroq;

    let availableModels: string[] = [];
    if (isAuto) {
      if (config.llm.groqModels && config.llm.groqModels.length > 0) {
        availableModels = config.llm.groqModels;
      } else if (config.llm.apiKey) {
        try {
          const fetched = await this.getGroqModels(config.llm.apiKey);
          if (fetched && fetched.length > 0) {
            availableModels = fetched;
            ConfigManager.getInstance().save({
              ...config,
              llm: { ...config.llm, groqModels: fetched },
            });
          }
        } catch (e) {
          console.warn('[TranslationService] Failed to auto-fetch Groq models:', e);
        }
      }
    }

    if (isAuto && availableModels.length === 0) {
      this.overlayServer.broadcast('translation_remove', { id: subtitleId });
      return {
        text: null,
        error:
          'No Groq models available. Please configure your API Key and fetch models in Settings.',
      };
    }

    // retry loop
    const maxRetries = isAuto ? availableModels.length : 1;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Determine model to use
        let modelToUse = currentModel;
        if (isAuto) {
          modelToUse = availableModels[this.currentModelIndex % availableModels.length];
        } else if (isLocalPlamo) {
          modelToUse =
            currentModel === 'plamo-3-translate-2b'
              ? 'plamo-3-translate-2b'
              : 'plamo-3-translate-0.8b';
        }

        const start = Date.now();

        const configuredTarget = config.translation?.targetLang || 'auto';
        const { targetLang } = PromptFactory.getPrompt(configuredTarget, detectedLanguage);
        const systemPrompt = this.getSystemPrompt(detectedLanguage);
        const recentHistory = this.getActiveHistory();
        const matchedGlossary = this.getPlamoGlossary(text, detectedLanguage);
        const adapter = resolveModelAdapter(modelToUse, config.llm.provider);
        const adapterRequest = adapter.buildRequest({
          text,
          sourceLang: detectedLanguage,
          targetLangName: targetLang,
          systemPrompt,
          history: recentHistory,
          glossary: matchedGlossary,
        });

        console.log(
          `[TranslationService] Provider="${config.llm.provider}" Adapter="${adapter.family}" Model="${modelToUse}" (lang="${detectedLanguage}" -> "${targetLang}", ctx:${recentHistory.length}, gls:${matchedGlossary.length})`,
        );

        console.debug(`[TranslationService] LLM request messages:`, adapterRequest.messages);

        console.log(`[TranslationService] Sending request: "${text}" (Model: ${modelToUse})`);

        const maxGenRetries = 3;
        let cleanText = '';
        let duration = 0;

        for (let genAttempt = 1; genAttempt <= maxGenRetries; genAttempt++) {
          const currentTemperature = Number((0.2 + (genAttempt - 1) * 0.1).toFixed(1));
          let result = '';

          if (isLocalPlamo) {
            if (!this.localTranslator) {
              this.overlayServer.broadcast('translation_remove', { id: subtitleId });
              return { text: null, error: 'PLaMo Local Translator not initialized' };
            }
            result = await this.localTranslator({
              model: modelToUse,
              messages: adapterRequest.messages,
              stop: adapterRequest.stop,
              chat_template_kwargs: adapterRequest.chat_template_kwargs,
              fallbackPrompt: adapterRequest.fallbackPrompt,
              temperature: currentTemperature,
            });
            duration = Date.now() - start;
          } else {
            const client = this.getLLMClient();
            if (!client) {
              this.overlayServer.broadcast('translation_remove', { id: subtitleId });
              return { text: null, error: 'Client Init Failed' };
            }

            const requestBody: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
              chat_template_kwargs?: Record<string, unknown>;
            } = {
              messages: adapterRequest.messages,
              model: modelToUse,
              temperature: currentTemperature,
            };

            if (adapterRequest.stop && adapterRequest.stop.length > 0) {
              requestBody.stop = adapterRequest.stop;
            }
            if (adapterRequest.chat_template_kwargs) {
              requestBody.chat_template_kwargs = adapterRequest.chat_template_kwargs;
            }

            const completion = await client.chat.completions.create(requestBody);
            duration = Date.now() - start;

            const choiceMsg = completion.choices[0]?.message as
              | {
                  content?: string | null;
                  reasoning?: string | null;
                  reasoning_content?: string | null;
                }
              | undefined;
            result = choiceMsg?.content || '';

            console.debug(
              `[TranslationService] LLM response (JSON):`,
              JSON.stringify(completion, null, 2),
            );
          }

          console.debug(`[TranslationService] LLM response (raw):`, result);

          cleanText = adapter.cleanOutput(result, text);

          // If PlamoAdapter intentionally discarded disproportionate output on 1-2 char noise, exit cleanly without retrying
          const strippedInput = text.replace(/[\s.?!,;:。、．！？・ー～〜…]+/gu, '');
          if (!cleanText && adapter.family === 'plamo' && strippedInput.length <= 2) {
            break;
          }

          if (cleanText) {
            break; // 正常に内容が抽出できたのでループを抜ける
          } else {
            console.warn(
              `[TranslationService] Attempt ${genAttempt} failed: Text became empty after filtering. Retrying...`,
            );
            if (genAttempt === maxGenRetries) {
              throw new Error('Could not obtain a valid result after tag removal.');
            }
          }
        }

        console.log(
          `[TRANS][${config.llm.provider}/${adapter.family}] [${duration}ms] ${text} -> ${cleanText}`,
        );

        // Stage 2 Overlay Broadcast & History Update
        if (cleanText) {
          this.pushHistory(text, cleanText);
          this.overlayServer.broadcast('translation', {
            id: subtitleId,
            original: text,
            translation: cleanText,
            pending: false,
          });
        } else {
          this.overlayServer.broadcast('translation_remove', { id: subtitleId });
        }

        return { text: cleanText };
      } catch (err: unknown) {
        console.error(
          `[LLM Error] (Model: ${isAuto ? availableModels[this.currentModelIndex % availableModels.length] : currentModel})`,
          err,
        );

        const errorObj = err as { status?: number; message?: string };

        if (errorObj.status === 429) {
          if (isAuto && attempt < maxRetries - 1) {
            const nextModel =
              availableModels[(this.currentModelIndex + 1) % availableModels.length];
            const msg = `[Auto-Switch] Rate Limit (429). Switching to: ${nextModel}`;
            console.warn(`[TranslationService] ${msg}`);
            this.onLog(msg);

            this.currentModelIndex++; // Move to next model
            continue; // Retry loop
          }
          this.overlayServer.broadcast('translation_remove', { id: subtitleId });
          return { text: null, error: 'Rate Limit Exceeded. Please wait.' };
        }
        this.overlayServer.broadcast('translation_remove', { id: subtitleId });
        return { text: null, error: errorObj.message || String(err) };
      }
    }
    this.overlayServer.broadcast('translation_remove', { id: subtitleId });
    return { text: null, error: 'Max retries exceeded' };
  }

  private getModelSize(id: string): number {
    // Try precise match for MoE (e.g. 8x7b)
    const moeMatch = id.match(/(\d+)x(\d+)b/i);
    if (moeMatch) {
      return parseInt(moeMatch[1]) * parseInt(moeMatch[2]);
    }

    // Standard match (e.g. 70b, 8b)
    const match = id.match(/(\d+)b/i);
    if (match) {
      return parseInt(match[1]);
    }

    return 0; // Unknown size
  }

  public async getGroqModels(apiKey: string): Promise<string[]> {
    try {
      const client = new OpenAI({
        apiKey: apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
        dangerouslyAllowBrowser: false, // Main process
      });

      const response = await client.models.list();

      // Filter: starts with llama-, qwen/, openai/
      const filtered = response.data
        .map((m) => m.id)
        .filter(
          (id) =>
            (id.startsWith('llama-') ||
              id.startsWith('gemma') ||
              id.startsWith('mixtral') ||
              id.startsWith('qwen/') ||
              id.startsWith('meta-llama/llama-') ||
              id.startsWith('openai/')) &&
            !id.includes('safeguard') && // Exclude safeguard models
            !id.includes('prompt-guard'), // Exclude prompt-guard models
        );

      // Sort by size descending, with localeCompare for deterministic order
      const sorted = filtered.sort((a, b) => {
        const sizeA = this.getModelSize(a);
        const sizeB = this.getModelSize(b);
        if (sizeB !== sizeA) {
          return sizeB - sizeA; // Descending
        }
        return a.localeCompare(b);
      });

      return sorted;
    } catch (error) {
      console.error('[TranslationService] Failed to fetch Groq models:', error);
      throw error;
    }
  }
}
