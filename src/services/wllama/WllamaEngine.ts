import { Wllama, AssetsPathConfig, WllamaConfig, WllamaChatMessage } from '@wllama/wllama';
import {
  buildPlamoChatTemplateKwargs,
  buildPlamoPfmlPrompt,
  cleanPlamoOutput,
  normalizeLangCode,
  PLAMO_STOP_TOKENS,
} from './plamoPrompt';
import { PromptFactory } from '../PromptFactory';

export interface WllamaEngineOptions {
  wasmUrl?: string;
  hfModelId?: string;
  hfFile?: string;
  modelUrl?: string;
  nCtx?: number;
  n_gpu_layers?: number;
  nThreads?: number;
  temperature?: number;
  maxTokens?: number;
  kv_unified?: boolean;
  useCache?: boolean;
  onProgress?: (progress: { loaded: number; total: number; percent: number }) => void;
}

export class WllamaEngine {
  private wllama: Wllama | null = null;
  private options: WllamaEngineOptions;
  private isLoaded = false;
  private isInitializing = false;

  constructor(options: WllamaEngineOptions) {
    this.options = {
      nCtx: 2048,
      n_gpu_layers: 9999,
      nThreads: 1,
      temperature: 0.2,
      maxTokens: 256,
      kv_unified: false,
      useCache: true,
      ...options,
    };
  }

  private resolveWasmPath(): string {
    if (this.options.wasmUrl) {
      return this.options.wasmUrl;
    }
    if (typeof window !== 'undefined' && window.location?.href) {
      return new URL('./wllama.wasm', window.location.href).href;
    }
    return './wllama.wasm';
  }

  public async init(): Promise<void> {
    if (this.isLoaded) return;
    if (this.isInitializing) {
      throw new Error('WllamaEngine is already initializing');
    }

    this.isInitializing = true;
    try {
      const wasmPath = this.resolveWasmPath();
      const pathConfig: AssetsPathConfig = {
        default: wasmPath,
      };

      const wllamaConfig: WllamaConfig = {
        suppressNativeLog: false,
        allowOffline: this.options.useCache ?? true,
      };

      this.wllama = new Wllama(pathConfig, wllamaConfig);
      this.wllama.setCompat(null);

      const downloadParams = {
        n_ctx: this.options.nCtx,
        n_gpu_layers: this.options.n_gpu_layers,
        n_threads: this.options.nThreads ?? 1,
        kv_unified: this.options.kv_unified ?? false,
        useCache: this.options.useCache ?? true,
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
          this.options.onProgress?.({ loaded, total, percent });
        },
      };

      console.log(
        `[WllamaEngine] Starting model loading (WebGPU layers: ${this.options.n_gpu_layers}, threads: ${this.options.nThreads ?? 1})...`,
      );

      if (this.options.hfModelId) {
        console.log(
          `[WllamaEngine] Loading from HF: ${this.options.hfModelId} / ${this.options.hfFile}`,
        );
        await this.wllama.loadModelFromHF(
          {
            repo: this.options.hfModelId,
            file: this.options.hfFile,
            quant: this.options.hfFile ? undefined : 'Q4_K_M',
          },
          downloadParams,
        );
        console.log('[WllamaEngine] Model loaded successfully into WebGPU context!');
      } else if (this.options.modelUrl) {
        console.log(`[WllamaEngine] Loading from URL: ${this.options.modelUrl}`);
        await this.wllama.loadModelFromUrl(this.options.modelUrl, downloadParams);
        console.log('[WllamaEngine] Model loaded successfully into WebGPU context!');
      } else {
        throw new Error('hfModelId/hfFile or modelUrl is required');
      }

      this.isLoaded = true;
    } finally {
      this.isInitializing = false;
    }
  }

  public async chat(
    messages: WllamaChatMessage[],
    options?: {
      maxTokens?: number;
      temperature?: number;
      chat_template_kwargs?: Record<string, unknown>;
    },
  ): Promise<string> {
    if (!this.wllama || !this.isLoaded) {
      throw new Error('WllamaEngine is not loaded. Call init() first.');
    }

    const maxTokens = options?.maxTokens ?? this.options.maxTokens ?? 256;
    const temperature = options?.temperature ?? this.options.temperature ?? 0.2;

    const response = await this.wllama.createChatCompletion({
      messages,
      chat_template_kwargs: options?.chat_template_kwargs as Record<string, string>,
      max_tokens: maxTokens,
      temperature,
    });

    const output = response.choices?.[0]?.message?.content ?? '';
    return cleanPlamoOutput(output);
  }

  public async generate(
    prompt: string,
    options?: { maxTokens?: number; temperature?: number; stop?: string[] },
  ): Promise<string> {
    if (!this.wllama || !this.isLoaded) {
      throw new Error('WllamaEngine is not loaded. Call init() first.');
    }

    const maxTokens = options?.maxTokens ?? this.options.maxTokens ?? 256;
    const temperature = options?.temperature ?? this.options.temperature ?? 0.2;

    const response = await this.wllama.createCompletion({
      prompt,
      max_tokens: maxTokens,
      temperature,
      stop: options?.stop ?? PLAMO_STOP_TOKENS,
    });

    const output = response.choices?.[0]?.text ?? '';
    return cleanPlamoOutput(output);
  }

  public async dispose(): Promise<void> {
    if (this.wllama) {
      try {
        await this.wllama.exit();
      } catch (err) {
        console.warn('[WllamaEngine] Error during exit:', err);
      }
      this.wllama = null;
    }
    this.isLoaded = false;
  }

  public isReady(): boolean {
    return this.isLoaded && this.wllama !== null;
  }
}

export class PlamoLocalService {
  private static instance: PlamoLocalService;
  private engine: WllamaEngine | null = null;
  private currentModelId = '';
  private initPromise: Promise<void> | null = null;
  private progressText = '';

  public static getInstance(): PlamoLocalService {
    if (!PlamoLocalService.instance) {
      PlamoLocalService.instance = new PlamoLocalService();
    }
    return PlamoLocalService.instance;
  }

  public getStatus(): { ready: boolean; loading: boolean; progress: string; model: string } {
    return {
      ready: this.engine?.isReady() ?? false,
      loading: this.initPromise !== null,
      progress: this.progressText,
      model: this.currentModelId,
    };
  }

  public async ensureLoaded(
    modelId = 'plamo-3-translate-0.8b',
    onProgress?: (msg: string) => void,
  ): Promise<void> {
    const normalizedModel =
      modelId === 'plamo-3-translate-2b' ? 'plamo-3-translate-2b' : 'plamo-3-translate-0.8b';

    if (this.engine?.isReady() && this.currentModelId === normalizedModel) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        if (this.engine) {
          await this.engine.dispose();
          this.engine = null;
        }

        const is2B = normalizedModel === 'plamo-3-translate-2b';
        const hfModelId = is2B
          ? 'pfnet/plamo-3-translate-2b-GGUF'
          : 'pfnet/plamo-3-translate-0.8b-GGUF';
        const hfFile = is2B
          ? 'plamo-3-translate-2b-Q4_K_M.gguf'
          : 'plamo-3-translate-0.8b-Q4_K_M.gguf';
        const label = is2B ? 'PLaMo 3 Translate 2B' : 'PLaMo 3 Translate 0.8B';

        this.progressText = `Initializing ${label}...`;
        onProgress?.(this.progressText);

        const engine = new WllamaEngine({
          hfModelId,
          hfFile,
          onProgress: ({ loaded, total, percent }) => {
            const mbLoaded = (loaded / (1024 * 1024)).toFixed(1);
            const mbTotal = (total / (1024 * 1024)).toFixed(1);
            const msg =
              percent >= 100
                ? `Loading ${label} into WebGPU VRAM...`
                : `Downloading ${label}: ${mbLoaded}MB / ${mbTotal}MB (${percent}%)`;
            this.progressText = msg;
            onProgress?.(msg);
          },
        });

        await engine.init();
        this.engine = engine;
        this.currentModelId = normalizedModel;
        this.progressText = '';
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public async translate(options: {
    text: string;
    detectedLanguage?: string;
    configuredTarget?: string;
    modelId?: string;
    context?: string;
    glossary?: Array<{ source: string; target: string }>;
    onProgress?: (msg: string) => void;
  }): Promise<{ text: string; targetLang: string; latencyMs: number }> {
    const start = performance.now();
    await this.ensureLoaded(options.modelId, options.onProgress);

    if (!this.engine) {
      throw new Error('PLaMo Local Engine failed to initialize');
    }

    const configuredTarget = options.configuredTarget || 'auto';
    const { targetLang } = PromptFactory.getPrompt(configuredTarget, options.detectedLanguage);
    const targetCode = normalizeLangCode(targetLang) || 'ja';
    const sourceCode = normalizeLangCode(options.detectedLanguage);

    // If source and target language are identical, skip unnecessary translation
    if (sourceCode && sourceCode === targetCode) {
      return {
        text: options.text,
        targetLang,
        latencyMs: Math.round(performance.now() - start),
      };
    }

    const kwargs = buildPlamoChatTemplateKwargs({
      targetLang: targetCode,
      sourceLang: sourceCode || undefined,
      context: options.context,
      glossary: options.glossary,
      form: 'plain',
    });

    let translated = await this.engine.chat([{ role: 'user', content: options.text }], {
      chat_template_kwargs: kwargs,
    });

    if (!translated) {
      const pfmlPrompt = buildPlamoPfmlPrompt({
        text: options.text,
        targetLang: targetCode,
        sourceLang: sourceCode || undefined,
        context: options.context,
        glossary: options.glossary,
        form: 'plain',
      });
      translated = await this.engine.generate(pfmlPrompt, {
        stop: PLAMO_STOP_TOKENS,
      });
    }

    // Guard against runaway hallucination on ultra-short 1-2 char inputs
    const strippedInput = options.text.replace(/[\s.?!,;:。、．！？・ー～〜…]+/gu, '');
    if (strippedInput.length <= 2 && translated.length > 20) {
      console.warn(
        `[PlamoLocalService] Discarded disproportionate output for short input "${options.text}" -> "${translated}"`,
      );
      translated = '';
    }

    const latencyMs = Math.round(performance.now() - start);
    console.log(
      `[PlamoLocalService] (${latencyMs}ms, ${sourceCode || 'auto'} -> ${targetCode}): "${options.text}" -> "${translated}"`,
    );

    return {
      text: translated,
      targetLang,
      latencyMs,
    };
  }
}
