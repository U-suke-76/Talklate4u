export interface RecognitionProgress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
  detail?: string;
}

export interface RecognitionResult {
  text: string;
  language?: string;
  error?: string;
}

/*
 * RecognitionManager
 * Handles speech recognition.
 * For Local: Delegates to a Web Worker running transformers.js to avoid main-thread UI freeze.
 * For Cloud: Calls external APIs (Groq/OpenAI).
 */
export class RecognitionManager {
  private static instance: RecognitionManager;
  private worker: Worker | null = null;
  private status: 'idle' | 'loading' | 'ready' | 'error' | 'transcribing' = 'idle';
  private currentConfig: any = {};
  private onProgressCallback: ((progress: RecognitionProgress) => void) | null = null;

  // Promise resolvers for active operations
  private loadResolve: (() => void) | null = null;
  private loadReject: ((err: any) => void) | null = null;
  private transcribeResolve: ((res: RecognitionResult) => void) | null = null;
  private transcribeReject: ((err: any) => void) | null = null;

  private constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (this.worker) return;

    // Initialize Web Worker
    // Reverted to URL-based instantiation
    this.worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (event) => {
      const { type, data, status, message, error } = event.data;

      switch (type) {
        case 'status':
          if (status === 'init') {
            this.status = 'loading';
            this.notifyProgress({ status: message || 'Loading model...', progress: 0 });
          } else if (status === 'ready') {
            this.status = 'ready';
            this.notifyProgress({ status: 'Model ready', progress: 100 });
            if (this.loadResolve) {
              this.loadResolve();
              this.loadResolve = null;
              this.loadReject = null;
            }
          }
          break;

        case 'progress':
          // data: { status: 'progress', file: '...', progress: 0.5 ... }
          this.notifyProgress(data);
          break;

        case 'result':
          this.status = 'ready';
          if (this.transcribeResolve) {
            this.transcribeResolve(data);
            this.transcribeResolve = null;
            this.transcribeReject = null;
          }
          break;

        case 'error': {
          this.status = 'error';
          const errMsg = error || 'Unknown worker error';
          window.electronAPI.log(`[RecognitionManager] Worker Error: ${errMsg}`);

          if (this.loadReject) {
            this.loadReject(new Error(errMsg));
            this.loadResolve = null;
            this.loadReject = null;
          }
          if (this.transcribeReject) {
            this.transcribeReject(new Error(errMsg));
            this.transcribeResolve = null;
            this.transcribeReject = null;
          }
          break;
        }
      }
    };

    this.worker.onerror = (err) => {
      console.error('[RecognitionManager] Worker connection error:', err);
      window.electronAPI.log(`[RecognitionManager] Worker connection error: ${err.message}`);

      const errorMsg = `Worker error: ${err.message}`;
      this.status = 'error';
      this.notifyProgress({ status: errorMsg });

      if (this.loadReject) {
        this.loadReject(new Error(errorMsg));
        this.loadResolve = null;
        this.loadReject = null;
      }
      if (this.transcribeReject) {
        this.transcribeReject(new Error(errorMsg));
        this.transcribeResolve = null;
        this.transcribeReject = null;
      }
    };
  }

  public static getInstance(): RecognitionManager {
    if (!RecognitionManager.instance) {
      RecognitionManager.instance = new RecognitionManager();
    }
    return RecognitionManager.instance;
  }

  public setOnProgress(callback: (progress: RecognitionProgress) => void) {
    this.onProgressCallback = callback;
  }

  private notifyProgress(progress: RecognitionProgress) {
    if (this.onProgressCallback) {
      this.onProgressCallback(progress);
    }

    // Also dispatch event for older listeners if any
    if (window.electronAPI) {
      const event = new CustomEvent('model-loading-progress', { detail: progress });
      window.dispatchEvent(event);
    }
  }

  public getStatus() {
    return this.status;
  }

  /**
   * Initialize or switch the model/provider.
   */
  public async loadModel(config: {
    provider: string;
    model?: string;
    models?: Record<string, string>;
    apiKey?: string;
    baseUrl?: string;
    language?: string;
    device?: string;
  }) {
    this.currentConfig = config as any;

    if (config.provider === 'groq' || config.provider === 'openai') {
      if (!config.apiKey) {
        console.warn('Cloud provider selected but no API Key.');
      }
      this.status = 'ready';
      this.notifyProgress({ status: `Ready (${config.provider})` });
      return;
    }

    // Local provider: Use Worker
    const language = config.language || 'ja';
    const models = config.models || {};
    // Determine model ID
    let modelId = config.model; // Default
    if (language === 'ja' && models.ja) modelId = models.ja;
    else if (language === 'en' && models.en) modelId = models.en;
    else if (models.default) modelId = models.default;

    if (!modelId) modelId = 'onnx-community/whisper-large-v3-turbo';

    // Handle device
    const device = config.device || 'webgpu';

    window.electronAPI.log(`[RecognitionManager] Requesting Worker load: ${modelId} on ${device}`);

    this.status = 'loading';
    this.notifyProgress({ status: 'Initiating model load...', progress: 0 });

    return new Promise<void>((resolve, reject) => {
      if (!this.worker) this.initWorker();

      this.loadResolve = resolve;
      this.loadReject = reject;

      this.worker?.postMessage({
        type: 'load',
        data: { modelId, device },
      });
    });
  }

  public async transcribe(audio: Float32Array, language = 'ja'): Promise<RecognitionResult> {
    if (this.currentConfig.provider === 'groq' || this.currentConfig.provider === 'openai') {
      return this.transcribeCloud(audio, language);
    }

    if (this.status !== 'ready' && this.status !== 'transcribing') {
      return { text: '', error: 'Recognition not ready. Please wait for model load.' };
    }

    this.status = 'transcribing';
    window.electronAPI.log(
      `[RecognitionManager] Sending transcribe request to worker: ${audio.length} samples`,
    );

    return new Promise<RecognitionResult>((resolve, reject) => {
      if (!this.worker) this.initWorker();

      this.transcribeResolve = resolve;
      this.transcribeReject = reject;

      // Clone buffer to transfer ownership if needed
      this.worker?.postMessage(
        {
          type: 'transcribe',
          data: { audio, language },
        },
        [audio.buffer],
      ); // Transfer buffer for performance

      // Timeout safety
      setTimeout(() => {
        if (this.transcribeResolve === resolve) {
          // check if still same request
          this.transcribeReject?.(new Error('TRANSCRIPTION_TIMEOUT_WORKER'));
          this.transcribeResolve = null;
          this.transcribeReject = null;
          this.status = 'ready';
        }
      }, 60000); // 60s timeout for CPU processing (can be slow)
    });
  }

  private async transcribeCloud(audio: Float32Array, language: string): Promise<RecognitionResult> {
    if (!this.currentConfig?.apiKey) return { text: '', error: 'No API Key' };

    // Convert Float32Array to WAV Blob
    const wavBlob = await this.audioBufferToWav(audio);
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');

    const model = this.currentConfig.model || 'whisper-large-v3-turbo'; // Default for Groq
    formData.append('model', model);
    if (language && language !== 'auto') formData.append('language', language);
    formData.append('response_format', 'json');

    const isGroq = this.currentConfig.provider === 'groq';
    const baseUrl = isGroq
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : this.currentConfig.baseUrl || 'https://api.openai.com/v1/audio/transcriptions';

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.currentConfig.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API Error ${response.status}: ${err}`);
      }

      const data = await response.json();
      return { text: data.text || '', language };
    } catch (err) {
      console.error('[RecognitionManager] Cloud Error:', err);
      return { text: '', error: String(err) };
    }
  }

  // Helper to convert Float32Array to WAV Blob
  private audioBufferToWav(float32Array: Float32Array): Promise<Blob> {
    return new Promise((resolve) => {
      const buffer = new ArrayBuffer(44 + float32Array.length * 2);
      const view = new DataView(buffer);

      // Write WAV header
      const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + float32Array.length * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, 1, true); // Mono
      view.setUint32(24, 16000, true); // Sample Rate
      view.setUint32(28, 16000 * 2, true); // Byte Rate
      view.setUint16(32, 2, true); // Block Align
      view.setUint16(34, 16, true); // Bits per Sample
      writeString(36, 'data');
      view.setUint32(40, float32Array.length * 2, true);

      // Write PCM samples
      let offset = 44;
      for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7fff;
        view.setInt16(offset, s, true);
        offset += 2;
      }

      resolve(new Blob([buffer], { type: 'audio/wav' }));
    });
  }
}
