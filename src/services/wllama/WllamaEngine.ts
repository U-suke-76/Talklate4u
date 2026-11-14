import { Wllama, AssetsPathConfig, WllamaConfig, WllamaChatMessage } from '@wllama/wllama';

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
      nCtx: 4096,
      n_gpu_layers: 99,
      nThreads: 1,
      temperature: 0.2,
      maxTokens: 256,
      kv_unified: false,
      useCache: true,
      ...options,
    };
  }

  public async init(): Promise<void> {
    if (this.isLoaded || this.isInitializing) {
      return;
    }

    this.isInitializing = true;

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const defaultWasmUrl = `${origin}/wllama/single-thread/wllama.wasm`;

      const pathConfig: AssetsPathConfig = {
        default: this.options.wasmUrl || defaultWasmUrl,
        'single-thread/wllama.wasm': this.options.wasmUrl || defaultWasmUrl,
        'multi-thread/wllama.wasm': this.options.wasmUrl || defaultWasmUrl,
      };

      const wllamaConfig: WllamaConfig = {
        suppressNativeLog: false,
        allowOffline: true,
        parallelDownloads: 3,
      };

      console.log('[WllamaEngine] Initializing Wllama WebGPU context with config:', pathConfig);
      this.wllama = new Wllama(pathConfig, wllamaConfig);

      const downloadParams = {
        n_ctx: this.options.nCtx ?? 4096,
        n_gpu_layers: this.options.n_gpu_layers ?? 99,
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

    return response.choices?.[0]?.message?.content ?? '';
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
      stop: options?.stop,
    });

    return response.choices?.[0]?.text ?? '';
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

/**
 * Pure Local WebGPU Transport Layer.
 * Receives already-adapted request payloads (`messages`, `stop`, `chat_template_kwargs`, `fallbackPrompt`)
 * from `TranslationService` via `ModelAdapter` and returns raw completion strings.
 */
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

  public async execute(options: {
    modelId?: string;
    messages: WllamaChatMessage[];
    stop?: string[];
    chat_template_kwargs?: Record<string, unknown>;
    fallbackPrompt?: string;
    temperature?: number;
    onProgress?: (msg: string) => void;
  }): Promise<string> {
    await this.ensureLoaded(options.modelId, options.onProgress);

    if (!this.engine) {
      throw new Error('PLaMo Local Engine failed to initialize');
    }

    let rawOutput = await this.engine.chat(options.messages, {
      temperature: options.temperature,
      chat_template_kwargs: options.chat_template_kwargs,
    });

    if (!rawOutput && options.fallbackPrompt) {
      rawOutput = await this.engine.generate(options.fallbackPrompt, {
        temperature: options.temperature,
        stop: options.stop,
      });
    }

    return rawOutput;
  }
}
