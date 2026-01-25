import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

import { PathUtils } from '../utils/PathUtils';

const AppConfigSchema = z.object({
  whisper: z.object({
    model: z.string(),
    language: z.string(),
    serverPort: z.number(),
    extraArgs: z.string().optional(),
    binPath: z.string().optional(),
    systemPrompt: z.string().optional(),
    provider: z.enum(['local', 'groq', 'openai']).default('local'),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
  }),
  llm: z.object({
    provider: z.enum(['groq', 'openai']),
    baseUrl: z.string().optional(),
    apiKey: z.string(),
    model: z.string(),
    groqModels: z.array(z.string()).optional(),
  }),
  translation: z.object({
    targetLang: z.string(),
  }),
  vad: z.object({
    silenceDurationMs: z.number(),
    positiveSpeechThreshold: z.number(),
    negativeSpeechThreshold: z.number(),
    minSpeechMs: z.number(),
    volumeThreshold: z.number().optional(),
  }),

  overlay: z.object({
    port: z.number(),
    styles: z
      .object({
        align: z.enum(['left', 'center', 'right']).default('left'),
        fontSize: z.number().default(16),
        originalColor: z.string().default('#ffffff'),
        originalStrokeColor: z.string().default('#000000'),
        translatedColor: z.string().default('#38bdf8'),
        translatedStrokeColor: z.string().default('#0c4a6e'),
        backgroundColor: z.string().default('transparent'),
        displayFormat: z.string().default('%1(%2)'),
      })
      .optional()
      .default({}),
  }),
  app: z.object({
    defaultMicName: z.string(),
  }),
  glossary: z
    .array(
      z.object({
        id: z.string(),
        sourceText: z.string(),
        sourceLang: z.string(),
        targetText: z.string(),
        targetLang: z.string(),
        bidirectional: z.boolean().optional(),
      }),
    )
    .optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export interface GlossaryEntry {
  id: string;
  sourceText: string;
  sourceLang: string;
  targetText: string;
  targetLang: string;
  bidirectional?: boolean;
}

export class ConfigManager {
  private static instance: ConfigManager;
  private store: Store<AppConfig>;

  private constructor() {
    // Parse command line arguments for --config
    const args = process.argv;
    const projectRoot = process.cwd();
    let configCwd = projectRoot;
    let configName = 'config';

    for (const arg of args) {
      if (arg.startsWith('--config=')) {
        const configArg = arg.split('=')[1];
        const absolutePath = path.isAbsolute(configArg)
          ? configArg
          : path.resolve(projectRoot, configArg);

        configCwd = path.dirname(absolutePath);
        configName = path.basename(absolutePath, '.json');
        break;
      }
    }

    const configDefaultPath = path.join(PathUtils.getResourcesPath(), 'config.default.json');

    let defaults: AppConfig;
    try {
      const rawConfig = fs.readFileSync(configDefaultPath, 'utf-8');
      const parsed = JSON.parse(rawConfig);
      // Default config should be valid, but verify anyway
      defaults = AppConfigSchema.parse(parsed);
      console.log('[ConfigManager] Loaded defaults from:', configDefaultPath);
    } catch (error) {
      console.warn(
        '[ConfigManager] Failed to load config.default.json, falling back to empty defaults',
        error,
      );
      // Fallback to avoid crash, though functionality might be limited
      defaults = {
        whisper: { model: 'ggml-base.bin', language: 'ja', serverPort: 8081, provider: 'local' },
        llm: { provider: 'groq', apiKey: '', model: 'llama-3.3-70b-versatile' },
        translation: { targetLang: 'auto' },
        vad: {
          silenceDurationMs: 500,
          positiveSpeechThreshold: 0.5,
          negativeSpeechThreshold: 0.35,
          minSpeechMs: 250,
          volumeThreshold: 0,
        },

        overlay: {
          port: 9000,
          styles: {
            align: 'left',
            fontSize: 16,
            originalColor: '#ffffff',
            originalStrokeColor: '#000000',
            translatedColor: '#38bdf8',
            translatedStrokeColor: '#0c4a6e',
            backgroundColor: 'transparent',
            displayFormat: '%1(%2)',
          },
        },
        app: { defaultMicName: '' },
        glossary: [],
      } as AppConfig;
    }

    console.log('[ConfigManager] Instantiating Store with:', {
      defaults: defaults ? 'loaded' : 'undefined',
      name: configName,
      cwd: configCwd,
    });
    try {
      this.store = new Store<AppConfig>({
        defaults: defaults,
        name: configName,
        cwd: configCwd,
      });
      console.log('[ConfigManager] Store instantiated successfully');
    } catch (e) {
      console.error('[ConfigManager] Failed to instantiate Store:', e);
      throw e;
    }

    // Validate current store content on startup
    try {
      const current = this.store.store;
      const result = AppConfigSchema.safeParse(current);
      if (!result.success) {
        console.error('[ConfigManager] Config validation failed:', result.error);
        // Option: Reset to defaults or just warn?
        // For now, warn but keep running, maybe the schema is stricter than actual usage
      } else {
        console.log('[ConfigManager] Config validation passed');
      }
    } catch (e) {
      console.error('[ConfigManager] Validation error', e);
    }

    console.log('[ConfigManager] Initialized with store at:', this.store.path);
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public getConfig(): AppConfig {
    return this.store.store;
  }

  public load() {
    // electron-store loads automatically on instantiation
    console.log('[ConfigManager] Config loaded (auto-managed by electron-store)');
  }

  public save(newConfig: AppConfig): void {
    try {
      // Validate before saving
      const result = AppConfigSchema.safeParse(newConfig);
      if (!result.success) {
        console.error('[ConfigManager] Invalid config, not saving:', result.error);
        throw new Error('Invalid configuration');
      }

      this.store.store = newConfig;
      console.log('[ConfigManager] Config saved');
    } catch (err) {
      console.error('[ConfigManager] Failed to save config', err);
      throw err;
    }
  }
}
