import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { ConfigManager } from '../managers/ConfigManager';
import { WhisperModel } from '../types/config';
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

  constructor() {
    super();
    this.whisperManager = new WhisperManager();
    this.senseVoiceManager = new SenseVoiceManager();

    this.whisperManager.on('download-progress', (progress: string) => {
      this.emit('download-progress', progress);
    });
    this.senseVoiceManager.on('download-progress', (progress: string) => {
      this.emit('download-progress', progress);
    });
  }

  public async startOnLaunch(): Promise<void> {
    const config = ConfigManager.getInstance().getConfig();
    if (config.whisper.provider === 'sensevoice') {
      await this.senseVoiceManager.start(config.whisper.language);
    } else {
      await this.whisperManager.start();
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
  }> {
    const config = ConfigManager.getInstance().getConfig();
    const isSenseVoice = config.whisper.provider === 'sensevoice';
    const isRunning = isSenseVoice
      ? (await this.senseVoiceManager.checkStatus()).running
      : (await this.whisperManager.checkStatus()).running;

    const missing: string[] = [];
    if (!isSenseVoice && !config.whisper?.model) missing.push('Whisper Model');

    const { provider, apiKey, baseUrl } = config.llm;
    if (provider === 'groq' && !apiKey) missing.push('Groq API Key');
    if (provider === 'openai' && !baseUrl && !apiKey) missing.push('OpenAI API Key');

    return {
      success: isRunning,
      isDownloading: isSenseVoice
        ? this.senseVoiceManager.isDownloading
        : this.whisperManager.isDownloading,
      progress: isSenseVoice
        ? this.senseVoiceManager.downloadProgress
        : this.whisperManager.downloadProgress,
      configIssues: missing,
    };
  }

  public async restart(): Promise<{ success?: boolean; error?: string }> {
    try {
      const config = ConfigManager.getInstance().getConfig();
      const provider = config.whisper.provider || 'local';

      if (provider === 'sensevoice') {
        this.whisperManager.stop();
        await this.senseVoiceManager.start(config.whisper.language);
        return { success: true };
      }

      this.senseVoiceManager.stop();
      const modelName = config.whisper.model;
      const modelPath = path.join(this.whisperManager.getModelsDir(), modelName);

      if (provider === 'local' && !fs.existsSync(modelPath)) {
        this.whisperManager.stop();
        await this.whisperManager.downloadModel(modelName);
      }

      await this.whisperManager.start(config.whisper.language);
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

  public async transcribe(buffer: ArrayBuffer): Promise<{
    text?: string;
    language?: string;
    emotion?: string;
    event?: string;
    error?: string;
    details?: string;
  }> {
    const config = ConfigManager.getInstance().getConfig();
    if (config.whisper.provider === 'sensevoice') {
      return await this.senseVoiceManager.transcribe(buffer);
    }
    return await this.whisperManager.transcribe(buffer);
  }

  public getWhisperModels(): WhisperModel[] {
    const modelsDir = this.whisperManager.getModelsDir();
    return WHISPER_MODEL_DEFINITIONS.map((m) => {
      const p = path.join(modelsDir, m.value);
      return { ...m, exists: fs.existsSync(p) };
    });
  }
}
