import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { ConfigManager } from '../managers/ConfigManager';
import { resolveLanguage } from '../utils/detectLanguage';
import { downloadFileWithProgress } from '../utils/FileDownloader';

 
const sherpaOnnx = require('sherpa-onnx-node');

const IS_DEV = process.env.NODE_ENV === 'development';
const PROJECT_ROOT = process.cwd();

const HF_BASE_URL =
  'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main';
const MODEL_FILENAME = 'model.int8.onnx';
const TOKENS_FILENAME = 'tokens.txt';

const NON_SPEECH_EVENTS = new Set([
  'BGM',
  'Applause',
  'Cry',
  'Sneeze',
  'Breath',
  'Cough',
  'Sing',
  'Speech_Noise',
  'GBG',
]);

const SHORT_NOISE_PATTERNS = [
  /^[\s.?!,;:。、．！？・ー～〜…()（）[\]「」『』]+$/u,
  /^[あいうえおんっー～〜んーあっえっおっうっふっはっ]+$/u,
  /^[음어아으흠헉]+$/u,
  /^[嗯啊哦呃唔唉]+$/u,
  /^[a-zA-Z]{1,2}$/,
];

const CJK_SPACE_REGEX =
  /(?<=[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF])\s+(?=[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF])/gu;

const CJK_ASCII_SPACE_REGEX =
  /(?<=[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF])\s+(?=[A-Za-z0-9!?.,])|(?<=[A-Za-z0-9!?.,])\s+(?=[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF])/gu;

function normalizeSenseVoiceText(text: string): string {
  return text.replace(CJK_SPACE_REGEX, '').replace(CJK_ASCII_SPACE_REGEX, '').trim();
}

interface SherpaOfflineResult {
  text?: string;
  lang?: string;
  emotion?: string;
  event?: string;
}

export class SenseVoiceManager extends EventEmitter {
  public isDownloading = false;
  public downloadProgress = '';
  private modelsDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognizer: any = null;
  private currentLanguage = 'auto';

  constructor() {
    super();
    this.modelsDir = IS_DEV
      ? path.join(PROJECT_ROOT, 'models', 'sensevoice')
      : path.join(app.getPath('userData'), 'sensevoice-models');

    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
    console.log('[SenseVoiceManager] Initialized. Models dir:', this.modelsDir);
  }

  public getModelsDir(): string {
    return this.modelsDir;
  }

  public isModelDownloaded(): boolean {
    const modelPath = path.join(this.modelsDir, MODEL_FILENAME);
    const tokensPath = path.join(this.modelsDir, TOKENS_FILENAME);
    return fs.existsSync(modelPath) && fs.existsSync(tokensPath);
  }

  public async checkStatus(): Promise<{ running: boolean }> {
    return { running: this.recognizer !== null };
  }

  public async ensureModelsDownloaded(): Promise<void> {
    const modelPath = path.join(this.modelsDir, MODEL_FILENAME);
    const tokensPath = path.join(this.modelsDir, TOKENS_FILENAME);

    if (fs.existsSync(modelPath) && fs.existsSync(tokensPath)) {
      return;
    }

    this.isDownloading = true;
    try {
      if (!fs.existsSync(tokensPath)) {
        this.downloadProgress = 'Downloading SenseVoice tokens.txt...';
        this.emit('download-progress', this.downloadProgress);
        await downloadFileWithProgress({
          url: `${HF_BASE_URL}/${TOKENS_FILENAME}`,
          destPath: tokensPath,
          label: 'SenseVoice tokens.txt',
          onProgress: (msg) => {
            this.downloadProgress = msg;
            this.emit('download-progress', this.downloadProgress);
          },
        });
      }

      if (!fs.existsSync(modelPath)) {
        this.downloadProgress = 'Downloading SenseVoice model.int8.onnx...';
        this.emit('download-progress', this.downloadProgress);
        await downloadFileWithProgress({
          url: `${HF_BASE_URL}/${MODEL_FILENAME}`,
          destPath: modelPath,
          label: 'SenseVoice-Small (INT8)',
          onProgress: (msg) => {
            this.downloadProgress = msg;
            this.emit('download-progress', this.downloadProgress);
          },
        });
      }
    } finally {
      this.isDownloading = false;
      this.downloadProgress = '';
    }
  }

  public async start(language?: string): Promise<void> {
    const config = ConfigManager.getInstance().getConfig();
    const targetLang = language || config.whisper.language || 'auto';

    await this.ensureModelsDownloaded();

    const modelPath = path.join(this.modelsDir, MODEL_FILENAME);
    const tokensPath = path.join(this.modelsDir, TOKENS_FILENAME);

    console.log(`[SenseVoiceManager] Creating OfflineRecognizer (language: ${targetLang})...`);
    const recognizerConfig = {
      featConfig: {
        sampleRate: 16000,
        featureDim: 80,
      },
      modelConfig: {
        senseVoice: {
          model: modelPath,
          language: targetLang === 'auto' ? 'auto' : targetLang,
          useInverseTextNormalization: 1,
        },
        tokens: tokensPath,
        numThreads: 2,
        provider: 'cpu',
        debug: 0,
      },
    };

    this.recognizer = await sherpaOnnx.OfflineRecognizer.createAsync(recognizerConfig);
    this.currentLanguage = targetLang;
    console.log('[SenseVoiceManager] OfflineRecognizer ready!');
  }

  public stop(): void {
    this.recognizer = null;
    console.log('[SenseVoiceManager] Stopped.');
  }

  private wavBufferToFloat32(buffer: ArrayBuffer): Float32Array {
    const headerOffset = buffer.byteLength > 44 ? 44 : 0;
    const pcmBytes = buffer.byteLength - headerOffset;
    const sampleCount = Math.floor(pcmBytes / 2);
    const view = new DataView(buffer, headerOffset, sampleCount * 2);
    const float32 = new Float32Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
      const int16 = view.getInt16(i * 2, true);
      float32[i] = int16 / 32768.0;
    }
    return float32;
  }

  public async transcribe(buffer: ArrayBuffer): Promise<{
    text?: string;
    language?: string;
    emotion?: string;
    event?: string;
    error?: string;
    details?: string;
  }> {
    try {
      const config = ConfigManager.getInstance().getConfig();
      const configuredLang = config.whisper.language || 'auto';

      if (!this.recognizer || this.currentLanguage !== configuredLang) {
        await this.start(configuredLang);
      }

      const startTime = performance.now();
      const samples = this.wavBufferToFloat32(buffer);
      const stream = this.recognizer.createStream();
      stream.acceptWaveform({
        samples,
        sampleRate: 16000,
      });

      const result = (await this.recognizer.decodeAsync(stream)) as SherpaOfflineResult;
      const elapsedMs = Math.round(performance.now() - startTime);

      const rawText = normalizeSenseVoiceText(result.text || '');
      const rawLang = (result.lang || '')
        .replace(/<\|/g, '')
        .replace(/\|>/g, '')
        .trim()
        .toLowerCase();
      const rawEmotion = (result.emotion || '').replace(/<\|/g, '').replace(/\|>/g, '').trim();
      const rawEvent = (result.event || '').replace(/<\|/g, '').replace(/\|>/g, '').trim();

      // 1. Filter out explicit non-speech or noise events detected by SenseVoice
      if (rawLang === 'nospeech' || NON_SPEECH_EVENTS.has(rawEvent)) {
        console.log(
          `[SenseVoiceManager] (${elapsedMs}ms) Ignored non-speech (lang=${rawLang}, event=${rawEvent}): "${rawText}"`,
        );
        return { text: '', language: 'und', emotion: rawEmotion, event: rawEvent };
      }

      // 2. Filter out short single-syllable breath/mic-bump hallucinations
      if (!rawText || SHORT_NOISE_PATTERNS.some((pattern) => pattern.test(rawText))) {
        console.log(
          `[SenseVoiceManager] (${elapsedMs}ms) Ignored short noise/filler: "${rawText}"`,
        );
        return { text: '', language: 'und', emotion: rawEmotion, event: rawEvent };
      }

      // 3. Filter out Chinese/Cantonese noise hallucinations when user is in ja/ko/en mode
      if (
        configuredLang === 'auto' &&
        (rawLang === 'zh' || rawLang === 'yue') &&
        !/[\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(rawText)
      ) {
        console.log(
          `[SenseVoiceManager] (${elapsedMs}ms) Ignored ${rawLang} noise hallucination: "${rawText}"`,
        );
        return { text: '', language: 'und', emotion: rawEmotion, event: rawEvent };
      }

      let finalLang = rawLang || (configuredLang !== 'auto' ? configuredLang : 'ja');
      if (rawText.length > 0) {
        const textDetected = resolveLanguage(rawText);
        if (textDetected !== 'und') {
          finalLang = textDetected;
        }
      }

      console.log(
        `[SenseVoiceManager] (${elapsedMs}ms) Text: "${rawText}", Lang: ${finalLang}, Emotion: ${rawEmotion}, Event: ${rawEvent}`,
      );

      return {
        text: rawText,
        language: finalLang,
        emotion: rawEmotion,
        event: rawEvent,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SenseVoiceManager] Transcribe error:', message);
      return { error: 'SenseVoice Transcribe Failed', details: message };
    }
  }
}
