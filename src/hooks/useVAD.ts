import { useState, useRef, useCallback } from 'react';
import { MicVAD } from '@ricky0123/vad-web';

export function useVAD() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [volume, setVolume] = useState(0);
  const myvad = useRef<MicVAD | null>(null);

  const startVAD = useCallback(
    async (
      deviceId: string | undefined,
      options: {
        silenceDurationMs: number;
        positiveSpeechThreshold: number;
        negativeSpeechThreshold: number;
        minSpeechMs: number;
        volumeThreshold?: number;
      } & Record<string, unknown>,
      onSpeechEnd: (audio: Float32Array) => void,
    ) => {
      // [Hack] MicVAD (v0.0.30) ignores the `stream` option and calls getUserMedia with default constraints.
      // We temporarily monkey-patch getUserMedia to inject our target deviceId.
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

      const log = window.electronAPI?.log || console.log;
      const volumeThreshold = options.volumeThreshold || 0;

      // Define the patch
      const patchedGetUserMedia = async (constraints: MediaStreamConstraints | undefined) => {
        log(
          `[VAD Init] getUserMedia called by library. Constraints: ${JSON.stringify(constraints)}`,
        );

        let newConstraints = constraints;
        if (deviceId && constraints && typeof constraints === 'object' && 'audio' in constraints) {
          log(`[VAD Init] Injecting deviceId: ${deviceId}`);
          newConstraints = {
            ...constraints,
            audio: {
              ...(constraints.audio as object),
              deviceId: { exact: deviceId },
            },
          };
        }
        return originalGetUserMedia(newConstraints);
      };

      try {
        // Apply patch
        navigator.mediaDevices.getUserMedia = patchedGetUserMedia;

        myvad.current = await MicVAD.new({
          modelURL: '/silero_vad_v5.onnx',
          workletURL: '/vad.worklet.bundle.min.js',
          positiveSpeechThreshold: options.positiveSpeechThreshold,
          negativeSpeechThreshold: options.negativeSpeechThreshold,
          minSpeechFrames: Math.max(1, Math.round(options.minSpeechMs / 32)),
          redemptionFrames: Math.max(1, Math.round(options.silenceDurationMs / 32)),
          onSpeechStart: () => {
            setIsProcessing(true);
          },
          onSpeechEnd: (audio: Float32Array) => {
            setIsProcessing(false);

            // Calculate average RMS of the audio
            if (volumeThreshold > 0 && audio.length > 0) {
              const rms = Math.sqrt(audio.reduce((s, x) => s + x * x, 0) / audio.length);
              // Convert RMS to percentage (0-100 scale, assuming max RMS around 0.2)
              const volumePercent = Math.min(100, rms * 500);

              if (volumePercent < volumeThreshold) {
                log(
                  `[VAD] Audio ignored: volume ${volumePercent.toFixed(1)}% < threshold ${volumeThreshold}%`,
                );
                return;
              }
              log(
                `[VAD] Audio accepted: volume ${volumePercent.toFixed(1)}% >= threshold ${volumeThreshold}%`,
              );
            }

            onSpeechEnd(audio);
          },
          onFrameProcessed: (probs: { isSpeech: number }, frame: Float32Array) => {
            if (frame) {
              const rms = Math.sqrt(frame.reduce((s, x) => s + x * x, 0) / frame.length);
              setVolume(rms);
            } else {
              setVolume(probs.isSpeech ? 0.1 : 0);
            }
          },
        });

        myvad.current.start();
        setIsListening(true);
      } catch (e) {
        console.error('VAD Start Error:', e);
        throw e;
      } finally {
        // Restore original immediately
        navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      }
    },
    [],
  );

  const stopVAD = useCallback(() => {
    if (myvad.current) {
      myvad.current.pause();
      myvad.current = null;
    }
    setIsListening(false);
    setVolume(0);
  }, []);

  return {
    isListening,
    isProcessing,
    volume,
    startVAD,
    stopVAD,
  };
}
