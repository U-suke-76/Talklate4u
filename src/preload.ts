import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Whisper / Audio
  transcribeAudio: (audioBuffer: ArrayBuffer, language: string) =>
    ipcRenderer.invoke('transcribe-audio', audioBuffer, language),
  restartWhisper: () => ipcRenderer.invoke('restart-whisper'),
  checkWhisperStatus: () => ipcRenderer.invoke('check-whisper-status'),
  checkOverlayStatus: () => ipcRenderer.invoke('check-overlay-status'),
  getWhisperModels: () => ipcRenderer.invoke('get-whisper-models'),

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
  onPlamoTranslateRequest: (
    callback: (payload: {
      requestId: string;
      text: string;
      detectedLanguage?: string;
      targetLang: string;
      model: string;
      context?: string;
      glossary?: Array<{ source: string; target: string }>;
    }) => void,
  ) => {
    ipcRenderer.removeAllListeners('plamo-translate-request');
    ipcRenderer.on('plamo-translate-request', (_event, payload) => callback(payload));
  },
  sendPlamoTranslateResult: (payload: { requestId: string; text?: string; error?: string }) =>
    ipcRenderer.send('plamo-translate-result', payload),
  sendDownloadProgress: (progress: string) =>
    ipcRenderer.send('download-progress-from-renderer', progress),

  // Debugging
  log: (message: string) => ipcRenderer.send('renderer-log', message),
});
