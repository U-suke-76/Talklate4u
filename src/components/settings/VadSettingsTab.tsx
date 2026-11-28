import React from 'react';
import { AppConfig } from '../../types/config';

interface VadSettingsTabProps {
  config: AppConfig;
  onChange: (nextConfig: AppConfig) => void;
}

export const VadSettingsTab: React.FC<VadSettingsTabProps> = ({ config, onChange }) => (
  <div className="py-4 grid grid-cols-[140px_1fr] gap-4 items-center">
    <div className="col-span-2 text-lg font-bold text-gray-300 mb-2">VAD Settings</div>

    <label className="font-bold text-gray-300" htmlFor="vad-silence">
      Silence (ms)
    </label>
    <input
      id="vad-silence"
      type="number"
      className="input input-bordered w-full"
      value={config.vad?.silenceDurationMs || 500}
      onChange={(e) =>
        onChange({
          ...config,
          vad: {
            ...config.vad,
            silenceDurationMs: parseInt(e.target.value),
          },
        })
      }
    />

    <label className="font-bold text-gray-300" htmlFor="vad-min-speech">
      Min Speech (ms)
    </label>
    <input
      id="vad-min-speech"
      type="number"
      className="input input-bordered w-full"
      value={config.vad?.minSpeechMs || 250}
      onChange={(e) =>
        onChange({
          ...config,
          vad: {
            ...config.vad,
            minSpeechMs: parseInt(e.target.value),
          },
        })
      }
    />

    <label className="font-bold text-gray-300" htmlFor="vad-pos-threshold">
      Pos Threshold
    </label>
    <input
      id="vad-pos-threshold"
      type="number"
      step="0.05"
      className="input input-bordered w-full"
      value={config.vad?.positiveSpeechThreshold || 0.5}
      onChange={(e) =>
        onChange({
          ...config,
          vad: {
            ...config.vad,
            positiveSpeechThreshold: parseFloat(e.target.value),
          },
        })
      }
    />

    <label className="font-bold text-gray-300" htmlFor="vad-neg-threshold">
      Neg Threshold
    </label>
    <input
      id="vad-neg-threshold"
      type="number"
      step="0.05"
      className="input input-bordered w-full"
      value={config.vad?.negativeSpeechThreshold || 0.35}
      onChange={(e) =>
        onChange({
          ...config,
          vad: {
            ...config.vad,
            negativeSpeechThreshold: parseFloat(e.target.value),
          },
        })
      }
    />

    <label className="font-bold text-gray-300" htmlFor="vad-volume-threshold">
      Volume Threshold (%)
    </label>
    <div className="flex items-center gap-4">
      <input
        id="vad-volume-threshold"
        type="range"
        min="0"
        max="50"
        className="range range-primary flex-1"
        value={config.vad?.volumeThreshold || 0}
        onChange={(e) =>
          onChange({
            ...config,
            vad: {
              ...config.vad,
              volumeThreshold: parseInt(e.target.value),
            },
          })
        }
      />
      <span className="w-12 text-center font-mono">{config.vad?.volumeThreshold || 0}%</span>
    </div>
    <div className="col-span-2 text-xs text-gray-500">
      Ignores low volume levels. 0% to disable. ~15% filters out background noise.
    </div>
  </div>
);
