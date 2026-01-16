import { useState, useRef, useEffect, useCallback } from 'react';
import { RecognitionManager, RecognitionProgress } from '../managers/RecognitionManager';
// import { AppConfig } from '../managers/ConfigManager'; // Unused

export interface OverlayStatusResult {
  success: boolean;
  port: number;
}

export function useServerStatus(
  isListeningRef: React.MutableRefObject<boolean>,
  addSystemLog: (msg: string) => void,
  setStatusText: (text: string) => void,
  statusText: string,
) {
  const [serverStatus, setServerStatus] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatusResult | null>(null);
  const lastServerStatus = useRef<boolean | null>(null);

  // Track if we have initialized the progress listener
  const isListenerAttached = useRef(false);

  // Function to ensure the correct model is loaded based on config
  const ensureModelLoaded = useCallback(async () => {
    try {
      const config = (await window.electronAPI.loadConfig()) as any;
      if (!config || !config.whisper) return;

      // Trigger load with full whisper config
      // The manager handles logic for provider (local vs cloud) and model selection.
      RecognitionManager.getInstance()
        .loadModel(config.whisper)
        .catch((err) => {
          console.error('Auto-load model failed:', err);
          // We don't necessarily want to spam logs here, manager will handle internal error state
        });
    } catch (e) {
      console.error('Failed to load config for model check', e);
    }
  }, []);

  const checkServer = useCallback(async () => {
    // 1. Check Overlay (still IPC)
    try {
      const overlayRes = await window.electronAPI.checkOverlayStatus();
      setOverlayStatus(overlayRes);
    } catch (e) {
      console.error('Overlay check failed', e);
      setOverlayStatus({ success: false, port: 0 });
    }

    // 2. Check RecognitionManager Status
    const rm = RecognitionManager.getInstance();
    const status = rm.getStatus();
    // transcribing is also a "ready" state (worker is alive)
    const isReady = status === 'ready' || status === 'transcribing';

    setServerStatus(isReady);

    // Auto-load if idle?
    if (status === 'idle') {
      ensureModelLoaded();
    }

    // Update UI text based on status
    // If loading, setStatusText is handled by progress callback usually.
    // If ready, show Ready.
    if (isReady && !isListeningRef.current) {
      setStatusText('Ready');
    } else if (status === 'error' && !isListeningRef.current) {
      setStatusText('Model Error (Check Logs)');
    }

    if (isReady && !lastServerStatus.current) {
      addSystemLog('Speech Recognition Model is Ready');
      // Validate config
      const cfg = (await window.electronAPI.loadConfig()) as any;
      if (!cfg?.llm?.apiKey && cfg?.llm?.provider === 'groq') {
        addSystemLog('WARNING: Groq API Key is missing. Translation to JP might fail.');
      }
    } else if (!isReady && status !== 'loading' && lastServerStatus.current === true) {
      addSystemLog('Speech Recognition Model unloaded or error.');
    }

    lastServerStatus.current = isReady;
  }, [addSystemLog, ensureModelLoaded, isListeningRef, setStatusText]); // removed statusText dep to avoid loops if needed

  useEffect(() => {
    // Attach progress listener
    if (!isListenerAttached.current) {
      RecognitionManager.getInstance().setOnProgress((p: RecognitionProgress) => {
        // Update status text with progress
        if (p.status) {
          if (p.progress !== undefined && p.progress < 100) {
            setStatusText(`${p.status} (${Math.round(p.progress || 0)}%)`);
          } else {
            setStatusText(p.status);
          }
        }
      });
      isListenerAttached.current = true;
    }

    // Initial check
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void checkServer();
    const intervalId = setInterval(checkServer, 5000);

    return () => clearInterval(intervalId);
  }, [checkServer, setStatusText]);

  const reloadModel = useCallback(async () => {
    try {
      const config = (await window.electronAPI.loadConfig()) as any;
      if (config?.whisper) {
        await RecognitionManager.getInstance().loadModel(config.whisper);
      }
    } catch (e) {
      console.error('Reload model failed', e);
    }
  }, []);

  return {
    serverStatus,
    overlayStatus,
    statusText, // returned from hook args usually, but here we don't manage it locally except via setStatusText side effects
    setStatusText,
    checkServer,
    reloadModel,
  };
}
