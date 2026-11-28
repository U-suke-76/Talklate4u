import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { ConfigManager } from '../managers/ConfigManager';
import { WhisperModel } from '../types/config';
import { RateLimitFallbackController } from '../utils/RateLimitFallback';
import { SenseVoiceManager } from './SenseVoiceManager';
import { WhisperManager } from './WhisperManager';

const WHISPER_MODEL_DEFINITIONS: Array<{ value: string; name: string }> = [
  { value: 'ggml-tiny.bin', name: 'Tiny' },
  { value: 'ggml-base.bin', name: 'Base' },
  { value: 'ggml-small.bin', name: 'Small' },
  { value: 'ggml-medium.bin', name: 'Medium' },
  { value: 'ggml-large-v3-turbo.bin', name: 'Large (v3 Turbo)' },
  { value: 'ggml-large-v3.bin', name: 'Large (v3)' },
];

export class AsrService extends EventEmitter {
  private readonly whisperManager: WhisperManager;
  private readonly senseVoiceManager: SenseVoiceManager;
  private readonly groqFallback = new RateLimitFallbackController();
  private senseVoiceStartingPromise: Promise<void> | null = null;
  private senseVoiceFallbackError: string | null = null;

  constructor(whisperManager?: WhisperManager, senseVoiceManager?: SenseVoiceManager) {
    super();
    this.whisperManager = whisperManager ?? new WhisperManager();
    this.senseVoiceManager = senseVoiceManager ?? new SenseVoiceManager();

    this.whisperManager.on('download-progress', (progress: string) => {
      this.emit('download-progress', progress);
    });
    this.senseVoiceManager.on('download-progress', (progress: string) => {
      this.emit('download-progress', progress);
    });
  }

  public resetFallbackState(): void {
    this.groqFallback.reset();
    this.senseVoiceFallbackError = null;
  }

  private async ensureSenseVoiceReady(language?: string): Promise<void> {
    const status = await this.senseVoiceManager.checkStatus();
    if (status.running) {
      this.senseVoiceFallbackError = null;
      return;
    }
    if (!this.senseVoiceStartingPromise) {
      this.senseVoiceFallbackError = null;
      this.senseVoiceStartingPromise = this.senseVoiceManager.start(language).finally(() => {
        this.senseVoiceStartingPromise = null;
      });
    }
    await this.senseVoiceStartingPromise;
  }

  private preloadSenseVoiceForFallback(language?: string): void {
    void this.ensureSenseVoiceReady(language).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.senseVoiceFallbackError = msg;
      console.warn(`[AsrService] SenseVoice fallback preload failed: ${msg}`);
    });
  }

  public async startOnLaunch(): Promise<void> {
    const config = ConfigManager.getInstance().getConfig();
    if (config.whisper.provider === 'sensevoice') {
      await this.senseVoiceManager.start(config.whisper.language);
    } else {
      await this.whisperManager.start();
      if (config.whisper.provider === 'groq' && config.whisper.fallbackToSenseVoice) {
        this.preloadSenseVoiceForFallback(config.whisper.language);
      }
    }
  }

  public stop(): void {
    this.whisperManager.stop();
    this.senseVoiceManager.stop();
  }

  public async checkStatus(): Promise<{
    success: boolean;
    isDownloading: boolean;
    progress: string;
    configIssues: string[];
    fallbackSenseVoiceStatus: 'idle' | 'loading' | 'ready' | 'error';
  }> {
    const config = ConfigManager.getInstance().getConfig();
    const isSenseVoice = config.whisper.provider === 'sensevoice';
    const isGroqFallback =
      config.whisper.provider === 'groq' && Boolean(config.whisper.fallbackToSenseVoice);
    const isRunning = isSenseVoice
      ? (await this.senseVoiceManager.checkStatus()).running
      : (await this.whisperManager.checkStatus()).running;

    let fallbackSenseVoiceStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
    if (isGroqFallback) {
      const svRunning = (await this.senseVoiceManager.checkStatus()).running;
      if (svRunning) {
        fallbackSenseVoiceStatus = 'ready';
      } else if (this.senseVoiceFallbackError) {
        fallbackSenseVoiceStatus = 'error';
      } else {
        fallbackSenseVoiceStatus = 'loading';
      }
    }

    const missing: string[] = [];
    if (!isSenseVoice && !config.whisper?.model) missing.push('Whisper Model');

    const { provider, apiKey, baseUrl } = config.llm;
    if (provider === 'groq' && !apiKey) missing.push('Groq API Key');
    if (provider === 'openai' && !baseUrl && !apiKey) missing.push('OpenAI API Key');

    const isDownloading = isSenseVoice
      ? this.senseVoiceManager.isDownloading
      : this.whisperManager.isDownloading ||
        (isGroqFallback && this.senseVoiceManager.isDownloading);
    const progress = isSenseVoice
      ? this.senseVoiceManager.downloadProgress
      : isGroqFallback && this.senseVoiceManager.isDownloading
        ? this.senseVoiceManager.downloadProgress
        : this.whisperManager.downloadProgress;

    return {
      success: isRunning,
      isDownloading,
      progress,
      configIssues: missing,
      fallbackSenseVoiceStatus,
    };
  }

  public async restart(): Promise<{ success?: boolean; error?: string }> {
    try {
      this.resetFallbackState();
      const config = ConfigManager.getInstance().getConfig();
      const provider = config.whisper.provider || 'local';

      if (provider === 'sensevoice') {
        this.whisperManager.stop();
        await this.senseVoiceManager.start(config.whisper.language);
        return { success: true };
      }

      if (!(provider === 'groq' && config.whisper.fallbackToSenseVoice)) {
        this.senseVoiceManager.stop();
      }
      const modelName = config.whisper.model;
      const modelPath = path.join(this.whisperManager.getModelsDir(), modelName);

      if (provider === 'local' && !fs.existsSync(modelPath)) {
        this.whisperManager.stop();
        await this.whisperManager.downloadModel(modelName);
      }

      await this.whisperManager.start(config.whisper.language);
      if (provider === 'groq' && config.whisper.fallbackToSenseVoice) {
        this.preloadSenseVoiceForFallback(config.whisper.language);
      }
      return { success: true };
    } catch (e) {
      this.whisperManager.isDownloading = false;
      this.senseVoiceManager.isDownloading = false;
      console.error('Restart ASR Error:', e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.stop();
      return { error: errorMessage };
    }
  }

  private async transcribeWithSenseVoiceFallback(
    buffer: ArrayBuffer,
    language?: string,
  ): Promise<{
    text?: string;
    language?: string;
    emotion?: string;
    event?: string;
    error?: string;
    details?: string;
  }> {
    try {
      await this.ensureSenseVoiceReady(language);
      return await this.senseVoiceManager.transcribe(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AsrService] SenseVoice fallback error: ${msg}`);
      return { error: 'SenseVoice Fallback Failed', details: msg };
    }
  }

  public async transcribe(buffer: ArrayBuffer): Promise<{
    text?: string;
    language?: string;
    emotion?: string;
    event?: string;
    error?: string;
    details?: string;
  }> {
    const config = ConfigManager.getInstance().getConfig();
    const provider = config.whisper.provider || 'local';

    if (provider === 'sensevoice') {
      return await this.senseVoiceManager.transcribe(buffer);
    }

    const canFallback = provider === 'groq' && Boolean(config.whisper.fallbackToSenseVoice);
    if (canFallback && this.groqFallback.isInCooldown()) {
      return await this.transcribeWithSenseVoiceFallback(buffer, config.whisper.language);
    }

    const res = await this.whisperManager.transcribe(buffer);
    const isRateLimit =
      Boolean(res.error) && (res.status === 429 || /\b429\b|rate.?limit/i.test(res.details || ''));

    if (canFallback && isRateLimit) {
      const record = this.groqFallback.recordRateLimit();
      if (record.stickySession) {
        console.warn(
          `[AsrService] [Fallback] Groq Whisper Rate Limit (429) reached ${record.consecutiveCount} times. Staying on SenseVoice-Small (Local) for this session.`,
        );
      } else {
        console.warn(
          `[AsrService] [Fallback] Groq Whisper Rate Limit (429) detected (#${record.consecutiveCount}/${record.maxRetries}). Falling back to SenseVoice-Small (Local) for ${Math.round(record.cooldownMs / 1000)}s.`,
        );
      }
      return await this.transcribeWithSenseVoiceFallback(buffer, config.whisper.language);
    }

    if (provider === 'groq' && !res.error && this.groqFallback.hasActiveFailures()) {
      console.log('[AsrService] [Fallback] Groq Whisper recovered from rate limit.');
      this.resetFallbackState();
    }

    return res;
  }

  public getWhisperModels(): WhisperModel[] {
    const modelsDir = this.whisperManager.getModelsDir();
    return WHISPER_MODEL_DEFINITIONS.map((m) => {
      const p = path.join(modelsDir, m.value);
      return { ...m, exists: fs.existsSync(p) };
    });
  }
}
