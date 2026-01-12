import { useState, useRef, useEffect, useCallback } from 'react';

export interface ServerStatusResult {
  success: boolean;
  isDownloading?: boolean;
  progress?: string;
  configIssues?: string[];
}

export interface OverlayStatusResult {
  success: boolean;
  port: number;
}

export function useServerStatus(
  isListeningRef: React.MutableRefObject<boolean>,
  addSystemLog: (msg: string) => void,
  setStatusText: (text: string) => void,
  statusText: string, // We might need the current value for checking "Downloading" state if logic depends on it, but here it depends on `res.isDownloading`.
) {
  const [serverStatus, setServerStatus] = useState(false);
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatusResult | null>(null);
  const lastServerStatus = useRef<boolean | null>(null);

  const checkServer = useCallback(async () => {
    const res = (await window.electronAPI.checkWhisperStatus()) as ServerStatusResult;
    setServerStatus(res.success);

    // Check overlay status
    const overlayRes = await window.electronAPI.checkOverlayStatus();
    setOverlayStatus(overlayRes);

    // If downloading, update statusText to show progress
    // If NOT downloading, show Ready/Offline status
    if (res.isDownloading && res.progress) {
      setStatusText(res.progress);
    } else {
      // Check if we are currently showing a "Downloading" status but the server says it's done.
      // We also check !isListeningRef.current to perform normal updates.
      const isStuckDownloading =
        statusText.startsWith('Downloading') || statusText.includes('Starting download');

      if (!isListeningRef.current || isStuckDownloading) {
        const msg = res.success ? 'Ready' : 'Server Offline (Check Settings)';
        setStatusText(msg);
      }
    }

    if (res.success && !lastServerStatus.current) {
      addSystemLog('Whisper Server is Ready');
      // Validate additional config on successful connection
      const cfg = (await window.electronAPI.loadConfig()) as {
        llm?: { apiKey?: string };
        whisper?: { model?: string };
      };
      if (!cfg?.llm?.apiKey) {
        addSystemLog('WARNING: Groq API Key is missing. Translation will not work.');
      }
      if (!cfg?.whisper?.model) {
        addSystemLog('WARNING: No Whisper model selected.');
      }
    } else if (!res.success && !res.isDownloading && lastServerStatus.current !== false) {
      // Just showing hint if it remains offline
      addSystemLog('Whisper Server is Offline.');

      // Use configIssues from main process
      if (res.configIssues && res.configIssues.length > 0) {
        res.configIssues.forEach((issue: string) => {
          addSystemLog(`Tip: Missing ${issue}. Please check Settings.`);
        });
      } else {
        addSystemLog('Tip: Ensure Whisper Server is running (Settings -> Save & Restart).');
      }
    }
    lastServerStatus.current = res.success;
  }, [addSystemLog, isListeningRef, setStatusText, statusText]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    checkServer();
    const intervalId = setInterval(() => {
      checkServer();
    }, 5000);

    window.electronAPI.onDownloadProgress((msg: string) => {
      setStatusText(msg);
    });

    return () => clearInterval(intervalId);
  }, [checkServer, setStatusText]);

  return {
    serverStatus,
    overlayStatus,
    statusText,
    setStatusText,
    checkServer,
  };
}
