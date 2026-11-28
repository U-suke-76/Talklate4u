import { AppConfig, WhisperModel } from './types/config';

export interface WhisperStatusResult {
  success: boolean;
  isDownloading?: boolean;
  progress?: string;
  configIssues?: string[];
  fallbackSenseVoiceStatus?: 'idle' | 'loading' | 'ready' | 'error';
}

export interface TranscribeResponse {
  text?: string;
  language?: string;
  emotion?: string;
  event?: string;
  error?: string;
  details?: string;
}

export interface ElectronAPI {
  loadConfig: () => Promise<AppConfig>;
  saveConfig: (config: AppConfig) => Promise<{ success?: boolean; error?: string }>;
  getWhisperModels: () => Promise<WhisperModel[]>;
  restartWhisper: () => Promise<{ success?: boolean; error?: string }>;
  checkWhisperStatus: () => Promise<WhisperStatusResult>;
  checkOverlayStatus: () => Promise<{ success: boolean; port: number }>;
  transcribeAudio: (buffer: ArrayBuffer, language: string) => Promise<TranscribeResponse>;
  translateText: (
    text: string,
    detectedLanguage?: string,
    logId?: number,
  ) => Promise<{ text?: string | null; error?: string }>;
  onTranslationPartial: (callback: (payload: { logId: number; text: string }) => void) => void;
  getGroqModels: (apiKey: string) => Promise<string[]>;

  onDownloadProgress: (callback: (message: string) => void) => void;
  onSystemLog: (callback: (message: string) => void) => void;
  onOpenSettings: (callback: () => void) => void;
  onPlamoTranslateRequest: (
    callback: (payload: {
      requestId: string;
      model: string;
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      stop?: string[];
      chat_template_kwargs?: Record<string, unknown>;
      fallbackPrompt?: string;
      temperature?: number;
      stream?: boolean;
    }) => void,
  ) => void;
  sendPlamoTranslateChunk: (payload: { requestId: string; delta: string }) => void;
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
