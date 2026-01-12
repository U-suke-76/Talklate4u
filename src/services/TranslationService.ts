import OpenAI, { ClientOptions } from 'openai';

import * as path from 'path';
import * as fs from 'fs';

import { ConfigManager } from '../managers/ConfigManager';
import { OverlayServer } from '../server/OverlayServer';
import Handlebars from 'handlebars';

import { PathUtils } from '../utils/PathUtils';
import { PromptFactory } from './PromptFactory';

export class TranslationService {
  private openaiClient: OpenAI | null = null;
  private overlayServer: OverlayServer;
  private promptTemplate: HandlebarsTemplateDelegate | null = null;
  private currentModelIndex = 0;

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

  constructor(overlayServer: OverlayServer, onLog: (msg: string) => void) {
    this.overlayServer = overlayServer;
    this.onLog = onLog;

    // Pre-compile template if possible or load on demand
    this.loadSystemPromptTemplate();
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
          clientConfig.baseURL = baseUrl;
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

  private getGlossaryBlock(sourceLang: string, targetLangCode: string): string {
    const config = ConfigManager.getInstance().getConfig();
    const glossary = config.glossary || [];

    const lines: string[] = [];

    glossary.forEach((entry) => {
      const isUniMatch =
        (entry.sourceLang === sourceLang || sourceLang === 'Unknown') &&
        entry.targetLang === targetLangCode;

      const isBiMatchReversed =
        entry.bidirectional &&
        (entry.targetLang === sourceLang || sourceLang === 'Unknown') &&
        entry.sourceLang === targetLangCode;

      if (isUniMatch) {
        // Direction: Source -> Target
        lines.push(`- ${entry.sourceText}: ${entry.targetText}`);
      } else if (isBiMatchReversed) {
        // Direction: Target -> Source (because we are translating TO Source)
        lines.push(`- ${entry.targetText}: ${entry.sourceText}`);
      }
    });

    if (lines.length === 0) return '';

    // Deduplicate lines just in case
    const uniqueLines = Array.from(new Set(lines));

    return `Use the following term definitions strictly:\n` + uniqueLines.join('\n');
  }

  private getSystemPrompt(detectedLanguage?: string): string {
    if (!this.promptTemplate) {
      this.loadSystemPromptTemplate();
      if (!this.promptTemplate) return 'You are a professional translator.'; // Fallback
    }

    const config = ConfigManager.getInstance().getConfig();
    const configuredTarget = config.translation?.targetLang || 'auto';

    const { instruction, targetLang } = PromptFactory.getPrompt(configuredTarget, detectedLanguage);
    const sourceLang = detectedLanguage || 'Unknown';

    // Map targetLang Name (from Factory) to Code (for Glossary)
    let targetLangCode = '';
    if (targetLang === 'Japanese') targetLangCode = 'ja';
    else if (targetLang === 'Korean') targetLangCode = 'ko';
    else if (targetLang === 'English') targetLangCode = 'en';

    const glossaryBlock = this.getGlossaryBlock(sourceLang, targetLangCode);

    return this.promptTemplate({
      INSTRUCTION: instruction,
      SOURCE_LANG: sourceLang,
      TARGET_LANG: targetLang,
      GLOSSARY: glossaryBlock,
    });
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

    const config = ConfigManager.getInstance().getConfig();
    const currentModel = config.llm?.model || 'llama-3.3-70b-versatile';
    const isGroq = config.llm.provider === 'groq';
    const isAuto = currentModel === 'auto' && isGroq;

    let availableModels: string[] = [];
    if (isAuto) {
      availableModels =
        config.llm.groqModels && config.llm.groqModels.length > 0
          ? config.llm.groqModels
          : ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']; // Fallback
    }

    // retry loop
    const maxRetries = isAuto ? availableModels.length : 1;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Determine model to use
        let modelToUse = currentModel;
        if (isAuto) {
          modelToUse = availableModels[this.currentModelIndex % availableModels.length];
        }

        const client = this.getLLMClient();
        if (!client) return { text: null, error: 'Client Init Failed' };

        const start = Date.now();

        const systemPrompt = this.getSystemPrompt(detectedLanguage);
        console.log(`[TranslationService] System Prompt generated for lang="${detectedLanguage}"`);

        console.debug(`[TranslationService] LLM request systemPrompt:`, systemPrompt);

        console.log(`[TranslationService] Sending request: "${text}" (Model: ${modelToUse})`);

        const completion = await client.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          model: modelToUse,
          temperature: 0.3,
          stop: ['<|'],
        });

        const end = Date.now();
        const duration = end - start;
        const result = completion.choices[0]?.message?.content || '';

        console.log(`[TRANS] [${duration}ms] ${text} -> ${result}`);

        console.debug(`[TranslationService] LLM response:`, JSON.stringify(completion, null, 2));

        // External Integrations
        if (result) {
          // Overlay
          this.overlayServer.broadcast('translation', { original: text, translation: result });
        }

        return { text: result };
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
          return { text: null, error: 'Rate Limit Exceeded. Please wait.' };
        }
        return { text: null, error: errorObj.message || String(err) };
      }
    }
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
              id.startsWith('openai/')) &&
            !id.includes('safeguard'), // Exclude safeguard models
        );

      // Sort by size descending
      const sorted = filtered.sort((a, b) => {
        const sizeA = this.getModelSize(a);
        const sizeB = this.getModelSize(b);
        return sizeB - sizeA; // Descending
      });

      return sorted;
    } catch (error) {
      console.error('[TranslationService] Failed to fetch Groq models:', error);
      throw error;
    }
  }
}
