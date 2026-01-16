import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Whisper / Audio

  checkOverlayStatus: () => ipcRenderer.invoke('check-overlay-status'),
  // Translation
  translateText: (text: string, detectedLanguage?: string) =>
    ipcRenderer.invoke('translate-text', text, detectedLanguage),
  getGroqModels: (apiKey: string) => ipcRenderer.invoke('get-groq-models', apiKey),

  // Config
  saveConfig: (config: unknown) => ipcRenderer.invoke('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'), // I should add this handler to main

  // Events
  onDownloadProgress: (callback: (message: string) => void) => {
    ipcRenderer.on('download-progress', (_event, message) => callback(message));
  },
  onSystemLog: (callback: (message: string) => void) => {
    ipcRenderer.on('system-log', (_event, message) => callback(message));
  },
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on('open-settings', () => callback());
  },

  // Debugging
  log: (message: string) => ipcRenderer.send('renderer-log', message),
});
