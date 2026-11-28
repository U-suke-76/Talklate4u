import { useCallback, useEffect, useRef, useState } from 'react';
import { PlamoLocalService } from '../services/wllama/WllamaEngine';

export type PlamoLocalStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Manages PLaMo Local WebGPU model preloading and main-process translation IPC requests.
 */
export function usePlamoLocal(
  addSystemLog: (msg: string) => void,
  setStatusText: (text: string) => void,
) {
  const [plamoStatus, setPlamoStatus] = useState<PlamoLocalStatus>('idle');
  const lastPlamoProgressLogRef = useRef<string>('');

  const logPlamoProgress = useCallback(
    (msg: string) => {
      setStatusText(msg);
      const pctMatch = msg.match(/\((\d+)%\)/);
      const key = pctMatch ? `${Math.floor(parseInt(pctMatch[1], 10) / 10) * 10}%` : msg;
      if (lastPlamoProgressLogRef.current !== key) {
        lastPlamoProgressLogRef.current = key;
        window.electronAPI.log(`[PLaMo Local] ${msg}`);
      }
    },
    [setStatusText],
  );

  const preloadPlamoIfNeeded = useCallback(
    (provider?: string, model?: string, fallbackEnabled?: boolean) => {
      const shouldPreload =
        provider === 'plamo-local' || (provider === 'groq' && Boolean(fallbackEnabled));
      if (!shouldPreload) {
        setPlamoStatus('idle');
        return;
      }
      const targetModel = provider === 'plamo-local' ? model : 'plamo-3-translate-0.8b';
      const modelLabel = targetModel || 'plamo-3-translate-0.8b';
      setPlamoStatus('loading');
      window.electronAPI.log(
        `[PLaMo Local] Preloading model: ${modelLabel}${provider === 'groq' ? ' (Fallback Standby)' : ''}`,
      );
      PlamoLocalService.getInstance()
        .ensureLoaded(targetModel, logPlamoProgress)
        .then(() => {
          const readyMsg = `[PLaMo Local] Ready (${modelLabel}${provider === 'groq' ? ' / Fallback Standby' : ''})`;
          setPlamoStatus('ready');
          addSystemLog(readyMsg);
          window.electronAPI.log(readyMsg);
          setStatusText('Ready');
        })
        .catch((e) => {
          const errMsg = `[PLaMo Local] Init error: ${e instanceof Error ? e.message : String(e)}`;
          setPlamoStatus('error');
          addSystemLog(errMsg);
          window.electronAPI.log(errMsg);
          setStatusText('PLaMo Local Init Error');
        });
    },
    [addSystemLog, logPlamoProgress, setStatusText],
  );

  useEffect(() => {
    window.electronAPI.onPlamoTranslateRequest(async (payload) => {
      try {
        const rawText = await PlamoLocalService.getInstance().execute({
          modelId: payload.model,
          messages: payload.messages,
          stop: payload.stop,
          chat_template_kwargs: payload.chat_template_kwargs,
          fallbackPrompt: payload.fallbackPrompt,
          temperature: payload.temperature,
          onProgress: logPlamoProgress,
          onChunk: payload.stream
            ? (delta) => {
                window.electronAPI.sendPlamoTranslateChunk({
                  requestId: payload.requestId,
                  delta,
                });
              }
            : undefined,
        });
        window.electronAPI.sendPlamoTranslateResult({
          requestId: payload.requestId,
          text: rawText,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        window.electronAPI.log(`[PLaMo Local] Inference error (${payload.requestId}): ${errMsg}`);
        window.electronAPI.sendPlamoTranslateResult({
          requestId: payload.requestId,
          error: errMsg,
        });
      }
    });
  }, [logPlamoProgress]);

  return { plamoStatus, preloadPlamoIfNeeded };
}
