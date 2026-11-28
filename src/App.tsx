import React, { useEffect, useState, useRef } from 'react';
import { useVAD } from './hooks/useVAD';
import { SettingsModal } from './components/SettingsModal';
import { useServerStatus } from './hooks/useServerStatus';
import { useSpeechTranslation } from './hooks/useSpeechTranslation';
import { LogViewer } from './components/LogViewer';
import { AppHeader } from './components/AppHeader';
import { useMicrophone } from './hooks/useMicrophone';
import { usePlamoLocal } from './hooks/usePlamoLocal';
import { cn } from './utils/cn';

const App: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [statusText, setStatusText] = useState('Initializing...');
  const [asrProvider, setAsrProvider] = useState<string>('');
  const [fallbackToSenseVoice, setFallbackToSenseVoice] = useState(false);
  const [llmProvider, setLlmProvider] = useState<string>('');
  const [fallbackToPlamoLocal, setFallbackToPlamoLocal] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const { isListening, volume, startVAD, stopVAD } = useVAD();
  const isListeningRef = useRef(isListening);

  // --- Hooks ---

  const scrollToBottom = React.useCallback(() => {
    setTimeout(() => {
      if (logsContainerRef.current) {
        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
      }
    }, 100);
  }, []);

  const { logs, addSystemLog, handleSpeechEnd } = useSpeechTranslation(
    setStatusText,
    scrollToBottom,
  );

  const { serverStatus, fallbackSenseVoiceStatus, overlayStatus, checkServer } = useServerStatus(
    isListeningRef,
    addSystemLog,
    setStatusText,
    statusText,
  );

  // --- Handlers ---

  const { activeMic, loadMicrophones, selectMicrophone, setActiveMic } =
    useMicrophone(addSystemLog);

  const { plamoStatus, preloadPlamoIfNeeded } = usePlamoLocal(addSystemLog, setStatusText);

  // --- Effects ---

  useEffect(() => {
    // Listen for backend system logs
    window.electronAPI.onSystemLog((msg: string) => {
      addSystemLog(msg);
    });

    // Listen for menu settings click
    window.electronAPI.onOpenSettings(() => {
      setShowSettings(true);
    });

    // Preload PLaMo Local model on startup if configured
    window.electronAPI
      .loadConfig()
      .then((cfg) => {
        setAsrProvider(cfg?.whisper?.provider || 'local');
        setFallbackToSenseVoice(Boolean(cfg?.whisper?.fallbackToSenseVoice));
        const provider = cfg?.llm?.provider || '';
        const fallback = Boolean(cfg?.llm?.fallbackToPlamoLocal);
        setLlmProvider(provider);
        setFallbackToPlamoLocal(fallback);
        preloadPlamoIfNeeded(provider, cfg?.llm?.model, fallback);
      })
      .catch(() => {
        /* ignore */
      });
  }, [addSystemLog, preloadPlamoIfNeeded]);
  useEffect(() => {
    if (volumeRef.current) {
      volumeRef.current.style.width = `${Math.min(100, volume * 500)}%`;
    }
  }, [volume]);

  useEffect(() => {
    if (progressRef.current) {
      const match = statusText.match(/(\d+)%/);
      const pct = match ? parseInt(match[1], 10) : 0;
      progressRef.current.style.width = `${pct}%`;
    }
  }, [statusText]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const startRecording = async () => {
    setStatusText('Starting VAD...');
    try {
      const currentConfig = await window.electronAPI.loadConfig();
      const micLabel = currentConfig?.app?.defaultMicName;
      // 1. Exact Match & Selection
      const mics = await loadMicrophones();
      const targetMic = await selectMicrophone(micLabel, mics);

      const micId = targetMic ? targetMic.deviceId : 'default';

      const vadOptions = {
        silenceDurationMs: currentConfig?.vad?.silenceDurationMs || 500,
        positiveSpeechThreshold: currentConfig?.vad?.positiveSpeechThreshold || 0.5,
        negativeSpeechThreshold: currentConfig?.vad?.negativeSpeechThreshold || 0.35,
        minSpeechMs: currentConfig?.vad?.minSpeechMs || 250,
        volumeThreshold: currentConfig?.vad?.volumeThreshold || 0,
      };

      await startVAD(micId, vadOptions, handleSpeechEnd);
      setStatusText(`Listening (${targetMic ? 'Custom' : 'Default'})...`);
    } catch (e) {
      console.error(e);
      const errMsg = `Error starting VAD: ${e instanceof Error ? e.message : String(e)}`;
      setStatusText('Error starting VAD');
      addSystemLog(errMsg);
      window.electronAPI.log(errMsg);
    }
  };

  const toggleRecording = async () => {
    if (isListening) {
      await stopVAD();
      setStatusText('Stopped');
      setActiveMic(null);
    } else {
      await startRecording();
    }
  };

  const handleSettingsSaved = async () => {
    try {
      const cfg = await window.electronAPI.loadConfig();
      setAsrProvider(cfg?.whisper?.provider || 'local');
      setFallbackToSenseVoice(Boolean(cfg?.whisper?.fallbackToSenseVoice));
      const provider = cfg?.llm?.provider || '';
      const fallback = Boolean(cfg?.llm?.fallbackToPlamoLocal);
      setLlmProvider(provider);
      setFallbackToPlamoLocal(fallback);
      preloadPlamoIfNeeded(provider, cfg?.llm?.model, fallback);
    } catch {
      /* ignore */
    }
    await checkServer();
    if (isListeningRef.current) {
      addSystemLog('Settings saved. Restarting VAD to apply changes...');
      // Stop current VAD
      await stopVAD();
      // Wait a bit to ensure clean stop? Usually not needed if await works.
      // Restart with new settings
      await startRecording();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 p-4 font-sans">
      <AppHeader
        asrProvider={asrProvider}
        serverStatus={serverStatus}
        fallbackToSenseVoice={fallbackToSenseVoice}
        fallbackSenseVoiceStatus={fallbackSenseVoiceStatus}
        overlayStatus={overlayStatus}
        llmProvider={llmProvider}
        fallbackToPlamoLocal={fallbackToPlamoLocal}
        plamoStatus={plamoStatus}
        statusText={statusText}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="flex-1 flex flex-col gap-4 overflow-hidden">
        <LogViewer logs={logs} containerRef={logsContainerRef} />

        <div className="bg-gray-800 p-4 rounded-lg flex flex-col gap-3">
          <div className="flex justify-between items-center text-xs text-gray-100 font-bold">
            <span>
              Microphone Input
              {activeMic?.label && (
                <span className="text-secondary font-normal ml-2">({activeMic.label})</span>
              )}
            </span>
            <span>{Math.round(volume * 500)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-700 rounded overflow-hidden">
            <div ref={volumeRef} className="h-full bg-green-500 transition-all duration-75"></div>
          </div>

          <div className="flex gap-4 items-center">
            <button
              className={cn('btn flex-1', isListening ? 'btn-error' : 'btn-primary')}
              onClick={toggleRecording}
              disabled={!serverStatus}
            >
              {isListening ? 'Stop Recording' : 'Start Recording'}
            </button>
          </div>

          <div className="flex justify-between items-center text-xs text-gray-500">
            <span className={llmProvider === 'plamo-local' ? '' : 'w-full text-center'}>
              Status: {statusText}
            </span>
            {llmProvider === 'plamo-local' && (
              <span>
                Built with{' '}
                <a
                  href="https://plamo.preferredai.jp/info/plamo-community-license-ja"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-gray-300"
                >
                  PLaMo
                </a>
              </span>
            )}
          </div>
        </div>
      </main>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={handleSettingsSaved}
        onLog={addSystemLog}
      />

      {/* Download Progress Modal */}
      {(statusText.startsWith('Downloading') || statusText.includes('Starting download')) && (
        <div className="fixed inset-0 bg-black/80 z-1000 flex items-center justify-center p-4">
          <div className="bg-gray-800 p-6 rounded-xl max-w-md w-full shadow-2xl border border-gray-700 animate-fade-in-up">
            <h3 className="text-xl font-bold mb-4 text-primary">System Update</h3>
            <p className="text-gray-300 mb-6 text-center">{statusText}</p>

            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden relative">
              <div
                ref={progressRef}
                className="bg-linear-to-r from-primary to-secondary h-full transition-all duration-300"
              ></div>
            </div>

            <p className="text-xs text-center text-gray-500 mt-4">
              Downloading AI Model... Please do not close the app.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
