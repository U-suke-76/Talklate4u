import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import log from 'electron-log/main';

// Managers & Services
import { ConfigManager } from './managers/ConfigManager';
import { AsrService } from './server/AsrService';
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
const LOGS_DIR = path.join(app.getPath('userData'), 'logs');

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
log.transports.file.level = app.isPackaged ? 'info' : 'debug';
log.transports.console.format = '[{h}:{i}:{s}.{ms}] {text}';
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

Object.assign(console, log.functions);
console.log('Logging initialized. Saving to:', path.join(LOGS_DIR, LOG_FILE_NAME));
console.log('[Main] process.argv:', process.argv);

// Initialize Managers
const configManager = ConfigManager.getInstance();
const asrService = new AsrService();
const overlayServer = new OverlayServer(configManager.getConfig().overlay.port);
const translationService = new TranslationService(overlayServer, (msg) => {
  if (mainWindow) {
    mainWindow.webContents.send('system-log', msg);
  }
});

const pendingPlamoRequests = new Map<
  string,
  { resolve: (text: string) => void; reject: (err: Error) => void }
>();
let plamoReqIdCounter = 1;

translationService.setLocalTranslator(async (params) => {
  const win = mainWindow;
  if (!win) {
    throw new Error('Main window is not available for WebGPU inference');
  }
  const requestId = `plamo-${Date.now()}-${plamoReqIdCounter++}`;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPlamoRequests.delete(requestId);
      reject(new Error('PLaMo Local translation timed out (120s)'));
    }, 120000);

    pendingPlamoRequests.set(requestId, {
      resolve: (text) => {
        clearTimeout(timer);
        resolve(text);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    win.webContents.send('plamo-translate-request', {
      requestId,
      ...params,
    });
  });
});

ipcMain.on(
  'plamo-translate-result',
  (_event, payload: { requestId: string; text?: string; error?: string }) => {
    const pending = pendingPlamoRequests.get(payload.requestId);
    if (!pending) return;
    pendingPlamoRequests.delete(payload.requestId);
    if (payload.error) {
      pending.reject(new Error(payload.error));
    } else {
      pending.resolve(payload.text ?? '');
    }
  },
);

ipcMain.on('download-progress-from-renderer', (_event, progress: string) => {
  if (mainWindow) {
    mainWindow.webContents.send('download-progress', progress);
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

  // Start ASR Service
  asrService
    .startOnLaunch()
    .catch((err) => console.error('Failed to start ASR service on launch:', err));

  asrService.on('download-progress', (progress: string) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progress);
    }
  });

  // Start Overlay
  const overlayPath = IS_DEV
    ? path.join(PROJECT_ROOT, 'src', 'overlay')
    : path.join(__dirname, 'overlay');
  console.log('Starting Overlay Server with path:', overlayPath);

  const currentConfig = configManager.getConfig();
  const initialStyles = currentConfig.overlay?.styles || {};
  overlayServer.start(overlayPath, initialStyles);

  if (mainWindow) {
    new MenuManager(mainWindow).buildMenu();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  asrService.stop();
  overlayServer.stop();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

// Config
ipcMain.handle('load-config', () => configManager.getConfig());

ipcMain.handle('save-config', async (_e, newConfig) => {
  try {
    configManager.save(newConfig);
    translationService.resetClient();

    if (newConfig.overlay?.styles) {
      overlayServer.updateStyles(newConfig.overlay.styles);
    }

    console.log('[App] Config saved & services updated');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

// Logging
ipcMain.on('renderer-log', (_event, message) => {
  console.log(`[Renderer] ${message}`);
});

// Whisper / ASR Status
ipcMain.handle('check-whisper-status', async () => {
  return await asrService.checkStatus();
});

// Overlay Status
ipcMain.handle('check-overlay-status', () => {
  return {
    success: overlayServer.isRunning(),
    port: overlayServer.getPort(),
  };
});

// Restart Whisper / ASR
ipcMain.handle('restart-whisper', async () => {
  return await asrService.restart();
});

// Transcribe
ipcMain.handle('transcribe-audio', async (_e, buffer: ArrayBuffer) => {
  return await asrService.transcribe(buffer);
});

// Translate
ipcMain.handle('translate-text', async (_e, text: string, detectedLanguage?: string) => {
  return await translationService.translate(text, detectedLanguage);
});

// Get Groq Models
ipcMain.handle('get-groq-models', async (_e, apiKey: string) => {
  return await translationService.getGroqModels(apiKey);
});

// Get Models
ipcMain.handle('get-whisper-models', async () => {
  return asrService.getWhisperModels();
});
