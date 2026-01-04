import { useState, useRef, useCallback } from 'react';
import { createWavBuffer } from '../utils/audioUtils';

export interface LogItem {
  id: number;
  time: string;
  transTime?: string;
  original: string;
  translated?: string;
  type?: "system" | "chat";
}

interface TranscribeResponse {
  text?: string;
  language?: string;
  error?: string;
}

interface TranslateResponse {
  text?: string | null;
  error?: string;
}

export function useSpeechTranslation(setStatusText: (text: string) => void, scrollToBottom: () => void) {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const logIdCounter = useRef(1);

  const addSystemLog = useCallback((message: string) => {
    const newLog: LogItem = {
      id: logIdCounter.current++,
      time: new Date().toLocaleTimeString(),
      original: message,
      type: "system",
    };
    setLogs((prev) => [...prev, newLog]);
    scrollToBottom();
  }, [scrollToBottom]);

  const handleSpeechEnd = async (audio: Float32Array) => {
    setStatusText("Transcribing...");
    const currentId = logIdCounter.current++;
    const recogTime = new Date().toLocaleTimeString();

    // Convert Float32 to Int16
    const pcm = new Int16Array(audio.length);
    for (let i = 0; i < audio.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, audio[i])) * 0x7fff;
    }

    const wavBuffer = createWavBuffer(pcm);

    try {
        const res = (await window.electronAPI.transcribeAudio(
            wavBuffer,
            "auto" // Prefer auto or config
        )) as TranscribeResponse;
        if (res.error) {
            console.error(res.error);
            setStatusText("Transcription Error");
            return;
        }

        const originalText = res.text?.trim();
        const detectedLang = res.language;

        if (!originalText || originalText === "[BLANK_AUDIO]") {
            setStatusText("Listening...");
            return;
        }

        const newLog: LogItem = {
            id: currentId,
            time: recogTime,
            original: originalText,
            translated: "...",
            type: "chat",
        };

        setLogs((prev) => [...prev, newLog]);
        scrollToBottom();

        setStatusText("Translating...");
        const transRes = (await window.electronAPI.translateText(
            originalText,
            detectedLang
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
                    transTime: transTime 
                };
            });
        });

        setStatusText("Listening...");
        scrollToBottom();
    } catch (e) {
        console.error(e);
        setStatusText("Error processing audio");
    }
  };

  return {
    logs,
    addSystemLog,
    handleSpeechEnd
  };
}
