import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import log from 'electron-log/main';

// Managers & Services
import { ConfigManager } from './managers/ConfigManager';
import { WhisperManager } from './server/WhisperManager';

import { OverlayServer } from './server/OverlayServer';
import { TranslationService } from './services/TranslationService';
import { MenuManager } from './managers/MenuManager';

dotenv.config();

// Handle Squirrel startup
import squirrelStartup from 'electron-squirrel-startup';
if (squirrelStartup) {
  app.quit();
}

// Initialize Logging
log.initialize();
const IS_DEV = process.env.NODE_ENV === 'development';
const PROJECT_ROOT = process.cwd();
const APP_ROOT = IS_DEV ? PROJECT_ROOT : path.dirname(app.getPath('exe'));
const LOGS_DIR = path.join(APP_ROOT, 'logs');

if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR);
  } catch (e) {
    console.error('Failed to create logs dir', e);
  }
}

const startTime = new Date();
const timestampStr = startTime.toISOString().replace(/[:.]/g, '-');
const LOG_FILE_NAME = `session_${timestampStr}.log`;

log.transports.file.resolvePathFn = () => path.join(LOGS_DIR, LOG_FILE_NAME);
log.transports.file.level = app.isPackaged ? false : 'debug';
log.transports.console.format = '[{h}:{i}:{s}.{ms}] {text}';
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Object.assign(console, log.functions);
Object.assign(console, log.functions);
console.log('Logging initialized. Saving to:', path.join(LOGS_DIR, LOG_FILE_NAME));
console.log('[Main] process.argv:', process.argv);

// Initialize Managers
const configManager = ConfigManager.getInstance();
const whisperManager = new WhisperManager();
const overlayServer = new OverlayServer(configManager.getConfig().overlay.port);
const translationService = new TranslationService(overlayServer, (msg) => {
  if (mainWindow) {
    mainWindow.webContents.send('system-log', msg);
  }
});

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.on('ready', () => {
  createWindow();

  // Start Services
  // Start Services
  whisperManager.start().catch((err) => console.error('Failed to start Whisper on launch:', err));

  // Hook Whisper Progress
  whisperManager.on('download-progress', (progress: string) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progress);
    }
  });

  // Start Overlay
  const overlayPath = IS_DEV
    ? path.join(PROJECT_ROOT, 'src', 'overlay')
    : path.join(__dirname, 'overlay');
  console.log('Starting Overlay Server with path:', overlayPath);
  overlayServer.start(overlayPath);

  if (mainWindow) {
    new MenuManager(mainWindow).buildMenu();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  whisperManager.stop();
  overlayServer.stop();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

// Config
ipcMain.handle('load-config', () => configManager.getConfig());

ipcMain.handle('save-config', async (e, newConfig) => {
  try {
    configManager.save(newConfig);
    translationService.resetClient();
    console.log('[App] Config saved & services updated');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

// Logging
ipcMain.on('renderer-log', (event, message) => {
  console.log(`[Renderer] ${message}`);
});

// Whisper Status
ipcMain.handle('check-whisper-status', async () => {
  const isRunning = (await whisperManager.checkStatus()).running;
  const config = configManager.getConfig();

  const missing: string[] = [];
  if (!config.whisper?.model) missing.push('Whisper Model');

  // Check LLM Config
  const { provider, apiKey, baseUrl } = config.llm;
  if (provider === 'groq' && !apiKey) missing.push('Groq API Key');
  if (provider === 'openai' && !baseUrl && !apiKey) missing.push('OpenAI API Key'); // Assume official needs key

  return {
    success: isRunning,
    isDownloading: whisperManager.isDownloading,
    progress: whisperManager.downloadProgress,
    configIssues: missing,
  };
});

// Overlay Status
ipcMain.handle('check-overlay-status', () => {
  return {
    success: overlayServer.isRunning(),
    port: overlayServer.getPort(),
  };
});

// Restart Whisper
ipcMain.handle('restart-whisper', async () => {
  try {
    const config = configManager.getConfig();
    const modelName = config.whisper.model;
    const modelPath = path.join(whisperManager.getModelsDir(), modelName);

    const provider = config.whisper.provider || 'local';

    // Only check/download model if provider is local
    if (provider === 'local') {
      if (!fs.existsSync(modelPath)) {
        whisperManager.stop();
        await whisperManager.downloadModel(modelName);
      }
    }

    await whisperManager.start(config.whisper.language);
    return { success: true };
  } catch (e) {
    // Reset downloading state just in case
    whisperManager.isDownloading = false;
    console.error('Restart Whisper Error:', e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    // Also stop if it failed halfway
    whisperManager.stop();
    return { error: errorMessage };
  }
});

// Transcribe
ipcMain.handle('transcribe-audio', async (e, buffer: ArrayBuffer) => {
  // Note: language arg is usually ignored by the server if it's already running with a set language,
  // but we accept it to match the signature.
  return await whisperManager.transcribe(buffer);
});

// Translate
ipcMain.handle('translate-text', async (e, text: string, detectedLanguage?: string) => {
  return await translationService.translate(text, detectedLanguage);
});

// Get Groq Models
ipcMain.handle('get-groq-models', async (e, apiKey: string) => {
  return await translationService.getGroqModels(apiKey);
});

// Get Models
ipcMain.handle('get-whisper-models', async () => {
  const models = [
    { value: 'ggml-tiny.bin', name: 'Tiny' },
    { value: 'ggml-base.bin', name: 'Base' },
    { value: 'ggml-small.bin', name: 'Small' },
    { value: 'ggml-medium.bin', name: 'Medium' },
    { value: 'ggml-large-v3-turbo.bin', name: 'Large (v3 Turbo)' },
    { value: 'ggml-large-v3.bin', name: 'Large (v3)' },
  ];
  const results = models.map((m) => {
    const p = path.join(whisperManager.getModelsDir(), m.value);
    return { ...m, exists: fs.existsSync(p) };
  });
  return results;
});
