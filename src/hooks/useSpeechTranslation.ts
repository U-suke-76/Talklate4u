import { useState, useRef, useCallback } from 'react';
import { RecognitionManager } from '../managers/RecognitionManager';

export interface LogItem {
  id: number;
  time: string;
  transTime?: string;
  original: string;
  translated?: string;
  type?: 'system' | 'chat';
}

interface TranslateResponse {
  text?: string | null;
  error?: string;
}

export function useSpeechTranslation(
  setStatusText: (text: string) => void,
  scrollToBottom: () => void,
) {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const logIdCounter = useRef(1);

  const addSystemLog = useCallback(
    (message: string) => {
      const newLog: LogItem = {
        id: logIdCounter.current++,
        time: new Date().toLocaleTimeString(),
        original: message,
        type: 'system',
      };
      setLogs((prev) => [...prev, newLog]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const handleSpeechEnd = async (audio: Float32Array) => {
    setStatusText('Transcribing...');
    const currentId = logIdCounter.current++;
    const recogTime = new Date().toLocaleTimeString();

    try {
      // Get current config to decide language and model
      const config = (await window.electronAPI.loadConfig()) as any; // Type 'any' to avoid strict sharing issues for now, or import AppConfig
      const language = config?.whisper?.language || 'ja';

      // Ensure the correct model is loaded for this language?
      // Proactive loading should happen in App/Settings, but we can double check here or just expect it to be ready.
      // If we try to transcribe without model, RecognitionManager throws.
      // Auto-loading here might be too slow for real-time, but safe.
      // Let's assume App manages loading.

      const res = await RecognitionManager.getInstance().transcribe(audio, language);

      if (res.error) {
        console.error(res.error);
        setStatusText(res.error); // Show detailed timeout/device error
        addSystemLog(`Error: ${res.error}`);
        return;
      }

      const originalText = res.text?.trim();
      // RecognitionManager returns the requested language, not necessarily detected if forced.
      // But we can assume it's the requested one or 'auto' behavior?
      // Transformers.js pipeline output usually doesn't give detection info unless asked specifically.
      const detectedLang = res.language || language;

      if (!originalText || originalText === '[BLANK_AUDIO]') {
        setStatusText('Listening...');
        return;
      }

      console.log(`[Recognition] Text: "${originalText}" (Lang: ${detectedLang})`);

      const newLog: LogItem = {
        id: currentId,
        time: recogTime,
        original: originalText,
        translated: '...',
        type: 'chat',
      };

      setLogs((prev) => [...prev, newLog]);
      scrollToBottom();

      setStatusText('Translating...');
      const transRes = (await window.electronAPI.translateText(
        originalText,
        detectedLang,
      )) as TranslateResponse;
      const transTime = new Date().toLocaleTimeString();

      setLogs((prev) => {
        // 1. If Error exists, display it (do not remove log)
        if (transRes.error) {
          return prev.map((log) => {
            if (log.id !== currentId) return log;
            return {
              ...log,
              translated: `⚠️ ${transRes.error}`, // Show error in UI
              transTime: transTime,
              // isError property removed to match interface
            };
          });
        }

        // 2. If text is null (and no error), it means it was Filtered/Hallucination -> Remove log
        if (transRes.text === null) {
          console.log(`[Frontend] Filtered hallucination: "${originalText}"`);
          return prev.filter((log) => log.id !== currentId);
        }

        // 3. Success case
        return prev.map((log) => {
          if (log.id !== currentId) return log;
          return {
            ...log,
            translated: transRes.text ?? undefined, // Handle null -> undefined
            transTime: transTime,
          };
        });
      });

      setStatusText('Listening...');
      scrollToBottom();
    } catch (e) {
      console.error(e);
      setStatusText('Error processing audio');
    }
  };

  return {
    logs,
    addSystemLog,
    handleSpeechEnd,
  };
}
