export interface ElectronAPI {
  loadConfig: () => Promise<unknown>;
  saveConfig: (config: unknown) => Promise<{ success: boolean; error?: string }>;
  getWhisperModels: () => Promise<unknown[]>;
  restartWhisper: () => Promise<{ success: boolean; error?: string }>;
  checkWhisperStatus: () => Promise<unknown>;
  checkOverlayStatus: () => Promise<{ success: boolean; port: number }>;
  transcribeAudio: (buffer: ArrayBuffer, language: string) => Promise<unknown>;
  translateText: (
    text: string,
    detectedLanguage?: string,
  ) => Promise<{ text?: string; error?: string }>;
  getGroqModels: (apiKey: string) => Promise<string[]>;

  onDownloadProgress: (callback: (message: string) => void) => void;
  onSystemLog: (callback: (message: string) => void) => void;
  onOpenSettings: (callback: () => void) => void;
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
  ) => void;
  sendPlamoTranslateResult: (payload: { requestId: string; text?: string; error?: string }) => void;
  sendDownloadProgress: (progress: string) => void;

  // Debugging
  log: (message: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
