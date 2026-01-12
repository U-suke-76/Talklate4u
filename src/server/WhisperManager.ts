import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { ConfigManager } from '../managers/ConfigManager';
import axios, { AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import * as http from 'http';
import { resolveLanguage } from '../utils/detectLanguage';

const IS_DEV = process.env.NODE_ENV === 'development';
const PROJECT_ROOT = process.cwd();

export class WhisperManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private currentLanguage = 'auto';
  public isDownloading = false;
  public downloadProgress = '';
  private binPath: string;
  private modelsDir: string;
  private httpAgent: http.Agent;
  private isRemoteActive = false;

  constructor() {
    super();
    const paths = this.getWhisperPaths();
    this.binPath = paths.binPath;
    this.modelsDir = paths.modelsDir;

    // Initialize HTTP Agent with Keep-Alive
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 1, // Serial processing, so 1 socket is enough
      timeout: 60000, // 60s timeout
    });

    console.log('[WhisperManager] Initialized');
    console.log('WHISPER_SERVER_BIN resolved to:', this.binPath);
    console.log('WHISPER_MODELS_DIR resolved to:', this.modelsDir);
  }

  private getWhisperPaths() {
    let binPath: string;
    let modelsDir: string;

    const config = ConfigManager.getInstance().getConfig();

    if (IS_DEV) {
      const base = path.join(PROJECT_ROOT, 'node_modules', 'nodejs-whisper', 'cpp', 'whisper.cpp');
      binPath = path.join(base, 'build', 'bin', 'whisper-server.exe');
      modelsDir = path.join(base, 'models');
    } else {
      // Production
      const potentialBinPath = path.join(process.resourcesPath, 'bin', 'whisper-server.exe');
      const flattenedBinPath = path.join(process.resourcesPath, 'whisper-server.exe');

      if (fs.existsSync(potentialBinPath)) {
        binPath = potentialBinPath;
      } else {
        binPath = flattenedBinPath;
      }

      // Also check for DLLs if needed? usually they are in the same dir and OS finds them.
      // If binary is in root, DLLs are likely in root too.

      modelsDir = path.join(app.getPath('userData'), 'whisper-models');
      if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });
    }

    // Override with custom path if configured and exists
    if (config.whisper.binPath && config.whisper.binPath.trim().length > 0) {
      console.log(`[WhisperManager] Found custom binPath in config: '${config.whisper.binPath}'`);
      binPath = path.resolve(config.whisper.binPath);
    } else {
      console.log(`[WhisperManager] No custom binPath configured (or empty). Using default.`);
    }

    console.log(`[WhisperManager] Final resolved binPath: '${binPath}'`);

    return { binPath, modelsDir };
  }

  async checkStatus() {
    if (this.isRemoteActive) return { running: true };
    if (!this.process) return { running: false };
    return { running: true };
  }

  public getModelsDir() {
    return this.modelsDir;
  }

  private async verifyRemoteConnection(
    provider: 'groq' | 'openai',
    apiKey: string,
    baseUrl?: string,
  ): Promise<boolean> {
    try {
      console.log(`[WhisperManager] Verifying connection to ${provider}...`);
      let url = '';
      if (provider === 'groq') {
        url = 'https://api.groq.com/openai/v1/models';
      } else {
        url = baseUrl ? `${baseUrl}/models` : 'https://api.openai.com/v1/models';
      }

      const axiosConfig: AxiosRequestConfig = {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        httpAgent: this.httpAgent,
        timeout: 10000,
      };

      await axios.get(url, axiosConfig);
      console.log(`[WhisperManager] Connection verified: ${provider}`);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[WhisperManager] Connection verification failed: ${msg}`);
      return false;
    }
  }

  async start(language?: string): Promise<void> {
    const config = ConfigManager.getInstance().getConfig();
    const targetLang = language || config.whisper.language || 'ja';
    const port = config.whisper.serverPort || 8081;
    const modelName = config.whisper.model || 'ggml-base.bin';

    // Check provider
    if (config.whisper.provider === 'groq' || config.whisper.provider === 'openai') {
      console.log(`[WhisperManager] Using remote provider: ${config.whisper.provider}`);

      // Validate Connection
      const apiKey = config.whisper.apiKey;
      if (apiKey) {
        this.isRemoteActive = await this.verifyRemoteConnection(
          config.whisper.provider,
          apiKey,
          config.whisper.baseUrl,
        );
      } else {
        console.warn('[WhisperManager] No API Key for remote provider');
        this.isRemoteActive = false;
      }

      // No local server to start
      if (this.process) {
        this.stop();
      }
      this.currentLanguage = targetLang;
      return;
    }

    // Local Provider Logic
    this.isRemoteActive = false; // Reset if switching to local

    // Local Provider Logic
    const modelPath = path.join(this.modelsDir, modelName);

    // Resolve binPath dynamically to allow config changes
    const paths = this.getWhisperPaths();
    this.binPath = paths.binPath;

    // Don't restart if same config (basic check)
    // Note: strictly we should check if binPath changed too, but simple restart is handled by caller usually
    if (this.process && this.currentLanguage === targetLang) {
      return;
    }

    this.stop();

    console.log(`[WhisperManager] Starting Server: ${modelName} on Port ${port} (${targetLang})`);

    if (!fs.existsSync(this.binPath)) {
      console.error(`[WhisperManager] Binary not found: ${this.binPath}`);
      throw new Error(`Binary not found at ${this.binPath}`);
    }

    this.currentLanguage = targetLang;

    // Custom Args Parsing
    const extraArgs = config.whisper.extraArgs
      ? config.whisper.extraArgs.split(' ').filter((s) => s.trim().length > 0)
      : [];

    const args = ['-m', modelPath, '--port', port.toString(), '-l', targetLang, ...extraArgs];

    console.log(`[WhisperManager] Spawning binary: ${this.binPath}`);
    console.log(`[WhisperManager] With args: ${JSON.stringify(args)}`);

    return new Promise((resolve, reject) => {
      try {
        // Execute from the same directory as the binary so Windows can find DLLs
        const binDir = path.dirname(this.binPath);
        this.process = spawn(this.binPath, args, { cwd: binDir });
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const child = this.process;

        // Monitor for immediate exit (e.g. invalid args)
        let settled = false;
        let lastErrorLog = '';

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            // It survived the startup window
            resolve();
          }
        }, 1000); // Wait 1s to ensure it doesn't crash immediately

        this.process.stdout?.on('data', (d) => {
          console.log(`[Whisper]: ${d}`);
        });

        this.process.stderr?.on('data', (d) => {
          const msg = d.toString();
          // Capture last error-like message for reporting
          if (
            msg.toLowerCase().includes('error') ||
            msg.toLowerCase().includes('fail') ||
            msg.toLowerCase().includes('unknown')
          ) {
            lastErrorLog = msg.trim();
            console.log(`[Whisper Err]: ${msg}`);
          } else {
            console.log(`[Whisper Log]: ${msg}`);
          }

          // Parse detected language from stderr (Whisper logs to stderr)
          // 1. Configured language: "lang = ko" or "lang = auto"
          const langMatch = msg.match(/lang\s*=\s*([a-zA-Z]{2,})/);
          if (langMatch && langMatch[1]) {
            const detected = langMatch[1];
            console.log(`[WhisperManager] Configured Language: ${detected}`);
            this.currentLanguage = detected;
          }

          // 2. Auto-detected language result: "auto-detected language: ja (p = 0.98...)"
          const autoMatch = msg.match(/auto-detected language:\s+([a-zA-Z]{2,})/);
          if (autoMatch && autoMatch[1]) {
            const detected = autoMatch[1];
            console.log(`[WhisperManager] Auto-detected Language: ${detected}`);
            this.currentLanguage = detected;
          }
        });

        this.process.on('close', (code) => {
          console.log(`[WhisperManager] Process exited: ${code}`);
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            // If it exits immediately, it's a failure, regardless of code (server should run forever)
            const errMsg = lastErrorLog ? `: ${lastErrorLog}` : ` (code ${code})`;
            reject(new Error(`Whisper server exited immediately${errMsg}`));
          }

          if (this.process === child) {
            this.process = null;
          }
        });

        this.process.on('error', (err) => {
          console.error('[WhisperManager] Spawn Error:', err);
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(err);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  stop() {
    this.isRemoteActive = false;
    if (this.process) {
      console.log('[WhisperManager] Stopping Server...');
      this.process.kill();
      this.process = null;
    }
  }

  async downloadModel(modelName: string) {
    const destPath = path.join(this.modelsDir, modelName);
    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}`;

    console.log(`[WhisperManager] Downloading ${modelName} to ${destPath}...`);
    this.isDownloading = true;
    this.downloadProgress = 'Starting download...';
    this.emit('download-progress', this.downloadProgress);

    try {
      const response = await axios.get<Readable>(url, {
        responseType: 'stream',
      });

      const total = parseInt(response.headers['content-length'] || '0', 10);
      let current = 0;
      let lastPct = 0;

      const tempPath = destPath + '.part';
      const writer = fs.createWriteStream(tempPath);

      await new Promise<void>((resolve, reject) => {
        const stream = response.data;
        stream.on('data', (chunk: Buffer) => {
          current += chunk.length;
          if (total > 0) {
            const pct = Math.floor((current / total) * 100);
            if (pct > lastPct) {
              lastPct = pct;
              this.downloadProgress = `Downloading ${modelName}: ${pct}%`;
              this.emit('download-progress', this.downloadProgress);
            }
          }
        });

        stream.pipe(writer);

        writer.on('finish', () => {
          try {
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            fs.renameSync(tempPath, destPath);
            resolve();
          } catch (e) {
            reject(e);
          }
        });

        writer.on('error', (err: Error) => {
          writer.close();
          try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch {
            /* ignore */
          }
          reject(err);
        });
      });
    } catch (error) {
      console.error(`[WhisperManager] Download failed:`, error);
      throw error;
    } finally {
      this.isDownloading = false;
      this.downloadProgress = '';
    }
  }

  public async transcribe(
    buffer: ArrayBuffer,
  ): Promise<{ text?: string; language?: string; error?: string; details?: string }> {
    const config = ConfigManager.getInstance().getConfig();
    const provider = config.whisper.provider || 'local';

    try {
      const formData = new FormData();
      formData.append('file', Buffer.from(buffer), {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });

      if (provider === 'groq' || provider === 'openai') {
        const apiKey = config.whisper.apiKey;
        if (!apiKey) {
          throw new Error('API Key is required for remote provider');
        }

        const model = config.whisper.model || 'whisper-1'; // Default fallbacks

        // Groq default URL
        let baseUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
        if (provider === 'openai') baseUrl = 'https://api.openai.com/v1/audio/transcriptions';
        if (config.whisper.baseUrl) baseUrl = config.whisper.baseUrl;

        formData.append('model', model);
        // formData.append('language', config.whisper.language || 'ja'); // Optional: force language if needed, but auto is usually better
        // Response format verbose_json allows us to get language? Or text is fine?
        // Groq/OpenAI default response is JSON { text: "..." }
        // To get language, we might need response_format='verbose_json'

        formData.append('response_format', 'verbose_json');

        const axiosConfig: AxiosRequestConfig = {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${apiKey}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          httpAgent: this.httpAgent,
        };

        const res = await axios.post(baseUrl, formData, axiosConfig);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = res.data as any;

        console.log('[WhisperManager] Remote Inference Response:', JSON.stringify(data, null, 2));

        const text = data.text;
        let language = data.language || 'ja'; // verbose_json returns language name (e.g. "japanese")

        // Normalize language name to code
        const langMap: Record<string, string> = {
          japanese: 'ja',
          english: 'en',
          korean: 'ko',
          chinese: 'zh',
        };

        if (langMap[language.toLowerCase()]) {
          language = langMap[language.toLowerCase()];
        }

        return { text, language };
      } else {
        // LOCAL
        const port = config.whisper.serverPort || 8081;

        if (config.whisper.systemPrompt && config.whisper.systemPrompt.trim().length > 0) {
          formData.append('prompt', config.whisper.systemPrompt);
          console.debug(`[WhisperManager] Using System Prompt: "${config.whisper.systemPrompt}"`);
        }

        // Cast config object to AxiosRequestConfig to handle potential type discrepancies with maxBodyLength
        const axiosConfig: AxiosRequestConfig = {
          headers: {
            ...formData.getHeaders(),
            'Content-Length': formData.getLengthSync(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          httpAgent: this.httpAgent, // Use our persistent agent
        };

        // Start Request
        const res = await axios.post<{ text: string }>(
          `http://127.0.0.1:${port}/inference`,
          formData,
          axiosConfig,
        );
        console.log('[WhisperManager] Inference Response:', JSON.stringify(res.data, null, 2));

        // テキストベースの言語検出で言語を決定
        // Whisperのstderrからの言語検出は不安定なため、テキスト内容から判定
        const textContent = res.data.text.trim();
        let finalLang = 'ja'; // Default fallback

        if (textContent.length > 0) {
          // currentLanguageが設定されている場合はそれを初期値として使用
          const initialLang =
            this.currentLanguage && this.currentLanguage !== 'auto' ? this.currentLanguage : 'ja';

          // テキストベースの言語検出で補正
          const detectedLang = resolveLanguage(textContent);

          if (detectedLang !== 'und') {
            finalLang = detectedLang;
            if (finalLang !== initialLang) {
              console.log(
                `[WhisperManager] Language detected from text: ${initialLang} -> ${finalLang}`,
              );
            }
          } else {
            // 検出不能時は初期値 (Whisperの言語またはja) を維持
            finalLang = initialLang;
          }

          this.currentLanguage = finalLang;
        }

        console.log(
          `[WhisperManager] Final Resolution - Text: "${res.data.text.substring(0, 20)}...", Lang: ${finalLang}`,
        );

        return { text: res.data.text, language: finalLang };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[WhisperManager] Transcribe error:', message);
      return { error: 'Transcribe Failed', details: message };
    }
  }
}
