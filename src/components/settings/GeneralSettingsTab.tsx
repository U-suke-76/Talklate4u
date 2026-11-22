import React from 'react';
import { AppConfig, MicrophoneEntry } from '../../types/config';

interface GeneralSettingsTabProps {
  config: AppConfig;
  allMics: MicrophoneEntry[];
  onChange: (nextConfig: AppConfig) => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
  config,
  allMics,
  onChange,
}) => (
  <div className="py-4 grid grid-cols-[140px_1fr] gap-4 items-center">
    <div className="col-span-2 text-lg font-bold text-gray-300 mb-2">General Settings</div>

    {/* Microphone */}
    <label className="font-bold text-gray-300" htmlFor="app-mic">
      Microphone
    </label>
    <select
      id="app-mic"
      className="select select-bordered w-full"
      title="Microphone"
      value={config.app?.defaultMicName || ''}
      onChange={(e) =>
        onChange({
          ...config,
          app: { ...config.app, defaultMicName: e.target.value },
        })
      }
    >
      <option value="" disabled>
        Select Microphone
      </option>
      {allMics.map((mic) => (
        <option key={mic.deviceId} value={mic.label}>
          {mic.label}
        </option>
      ))}
    </select>

    {/* Source Language */}
    <label className="font-bold text-gray-300" htmlFor="whisper-language">
      Speech Language
    </label>
    <select
      id="whisper-language"
      className="select select-bordered w-full"
      value={config.whisper.language || 'ja'}
      onChange={(e) =>
        onChange({
          ...config,
          whisper: { ...config.whisper, language: e.target.value },
        })
      }
    >
      <option value="ja">Japanese</option>
      <option value="ko">Korean</option>
      <option value="en">English</option>
      <option value="auto">Auto</option>
    </select>

    {/* Target Language */}
    <label className="font-bold text-gray-300" htmlFor="target-language">
      Target Language
    </label>
    <select
      id="target-language"
      className="select select-bordered w-full"
      value={config.translation?.targetLang || 'ja-ko'}
      onChange={(e) =>
        onChange({
          ...config,
          translation: { ...config.translation, targetLang: e.target.value },
        })
      }
    >
      <option value="ja-ko">Japanese ⇔ Korean (Bi-directional)</option>
      <option value="ja-en">Japanese ⇔ English (Bi-directional)</option>
      <option value="ko-en">Korean ⇔ English (Bi-directional)</option>
      <option value="ja">Japanese (Force Output)</option>
      <option value="ko">Korean (Force Output)</option>
      <option value="en">English (Force Output)</option>
    </select>
  </div>
);
