import { app } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';

import { AppConfig, AppConfigSchema, DEFAULT_CONFIG, GlossaryEntry } from '../types/config';
import { PathUtils } from '../utils/PathUtils';

export type { AppConfig, GlossaryEntry };

export class ConfigManager {
  private static instance: ConfigManager;
  private store: Store<AppConfig>;

  private constructor() {
    // Parse command line arguments for --config
    const args = process.argv;
    const projectRoot = process.cwd();

    // Default to undefined (userData) in production, but projectRoot in dev
    let configCwd: string | undefined = app.isPackaged ? undefined : projectRoot;
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
      defaults = AppConfigSchema.parse(parsed);
      console.log('[ConfigManager] Loaded defaults from:', configDefaultPath);
    } catch (error) {
      console.warn(
        '[ConfigManager] Failed to load config.default.json, falling back to DEFAULT_CONFIG',
        error,
      );
      defaults = DEFAULT_CONFIG;
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
