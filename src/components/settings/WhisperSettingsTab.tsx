import React from 'react';
import { AppConfig, WhisperModel } from '../../types/config';

interface WhisperSettingsTabProps {
  config: AppConfig;
  models: WhisperModel[];
  onChange: (nextConfig: AppConfig) => void;
}

export const WhisperSettingsTab: React.FC<WhisperSettingsTabProps> = ({
  config,
  models,
  onChange,
}) => (
  <div className="py-4 grid grid-cols-[140px_1fr] gap-4 items-center">
    <div className="col-span-2 text-lg font-bold text-gray-300 mb-2">Whisper Settings</div>

    {/* Whisper Provider */}
    <label className="font-bold text-gray-300" htmlFor="whisper-provider">
      ASR Provider
    </label>
    <select
      id="whisper-provider"
      className="select select-bordered w-full"
      value={config.whisper.provider || 'local'}
      onChange={(e) =>
        onChange({
          ...config,
          whisper: {
            ...config.whisper,
            provider: e.target.value as 'local' | 'groq' | 'openai' | 'sensevoice',
            model:
              e.target.value === 'groq'
                ? 'whisper-large-v3-turbo'
                : e.target.value === 'local'
                  ? 'ggml-base.bin'
                  : e.target.value === 'sensevoice'
                    ? 'sensevoice-small-int8'
                    : 'whisper-1',
          },
        })
      }
    >
      <option value="sensevoice">SenseVoice-Small (Local ONNX / Ultra-Fast)</option>
      <option value="local">Local (whisper.cpp)</option>
      <option value="groq">Groq API</option>
      <option value="openai">OpenAI API</option>
    </select>

    {/* API Key (Remote) */}
    {(config.whisper.provider === 'groq' || config.whisper.provider === 'openai') && (
      <>
        <label className="font-bold text-gray-300" htmlFor="whisper-api-key">
          API Key
        </label>
        <input
          id="whisper-api-key"
          type="password"
          className="input input-bordered w-full font-mono text-sm"
          value={config.whisper.apiKey || ''}
          placeholder={config.whisper.provider === 'groq' ? 'gsk_...' : 'sk-...'}
          onChange={(e) =>
            onChange({
              ...config,
              whisper: { ...config.whisper, apiKey: e.target.value },
            })
          }
        />
      </>
    )}

    {/* Base URL (OpenAI) */}
    {config.whisper.provider === 'openai' && (
      <>
        <label className="font-bold text-gray-300" htmlFor="whisper-base-url">
          Base URL
        </label>
        <input
          id="whisper-base-url"
          type="text"
          className="input input-bordered w-full font-mono text-sm"
          value={config.whisper.baseUrl || ''}
          placeholder="https://api.openai.com/v1/audio/transcriptions"
          onChange={(e) =>
            onChange({
              ...config,
              whisper: { ...config.whisper, baseUrl: e.target.value },
            })
          }
        />
      </>
    )}

    {/* Whisper Model */}
    <label className="font-bold text-gray-300" htmlFor="whisper-model">
      ASR Model
    </label>
    {config.whisper.provider === 'sensevoice' ? (
      <select
        id="whisper-model"
        className="select select-bordered w-full"
        value="sensevoice-small-int8"
        disabled
      >
        <option value="sensevoice-small-int8">
          SenseVoice-Small INT8 (zh/en/ja/ko/yue, ~230MB)
        </option>
      </select>
    ) : config.whisper.provider === 'groq' ? (
      <select
        id="whisper-model"
        className="select select-bordered w-full"
        value={config.whisper.model}
        onChange={(e) =>
          onChange({
            ...config,
            whisper: { ...config.whisper, model: e.target.value },
          })
        }
      >
        <option value="whisper-large-v3-turbo">whisper-large-v3-turbo</option>
        <option value="whisper-large-v3">whisper-large-v3</option>
        <option value="distil-whisper-large-v3-en">distil-whisper-large-v3-en</option>
        <option value="whisper-1">whisper-1</option>
      </select>
    ) : config.whisper.provider === 'openai' ? (
      <input
        id="whisper-model"
        type="text"
        className="input input-bordered w-full"
        value={config.whisper.model}
        placeholder="whisper-1"
        onChange={(e) =>
          onChange({
            ...config,
            whisper: { ...config.whisper, model: e.target.value },
          })
        }
      />
    ) : (
      <select
        id="whisper-model"
        className="select select-bordered w-full"
        value={config.whisper.model}
        onChange={(e) =>
          onChange({
            ...config,
            whisper: { ...config.whisper, model: e.target.value },
          })
        }
      >
        {models.map((m) => (
          <option key={m.value} value={m.value}>
            {m.name} {m.exists ? '' : '(Download Needed)'}
          </option>
        ))}
      </select>
    )}

    {/* Groq Rate Limit Fallback */}
    {config.whisper.provider === 'groq' && (
      <>
        <label className="font-bold text-gray-300" htmlFor="whisper-fallback-sensevoice">
          Rate Limit Fallback
        </label>
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              id="whisper-fallback-sensevoice"
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={Boolean(config.whisper.fallbackToSenseVoice)}
              onChange={(e) =>
                onChange({
                  ...config,
                  whisper: {
                    ...config.whisper,
                    fallbackToSenseVoice: e.target.checked,
                  },
                })
              }
            />
            <span className="text-sm text-gray-300">
              Groq のレート制限 (429) 時に SenseVoice-Small (Local) で続行する
            </span>
          </label>
          <p className="text-xs text-gray-400">
            有効にすると、Groq Whisper がレート制限に達した際にローカルの SenseVoice-Small
            へ自動で切り替えて音声認識を継続します（一定時間後に Groq への復帰を再試行します）。
          </p>
        </div>
      </>
    )}

    {/* Local Only Settings */}
    {(!config.whisper.provider || config.whisper.provider === 'local') && (
      <>
        <label className="font-bold text-gray-300" htmlFor="whisper-bin-path">
          Whisper Server Path
        </label>
        <input
          id="whisper-bin-path"
          type="text"
          className="input input-bordered w-full font-mono text-sm"
          placeholder="Absolute path to whisper-server.exe (Leave empty for built-in)"
          value={config.whisper.binPath || ''}
          onChange={(e) =>
            onChange({
              ...config,
              whisper: { ...config.whisper, binPath: e.target.value },
            })
          }
        />
        <div className="col-span-2 text-xs text-gray-500 mb-2">
          Optional: Specify custom server path (e.g., for GPU/CUDA version).
        </div>

        <label className="font-bold text-gray-300" htmlFor="whisper-port">
          Whisper Port
        </label>
        <input
          id="whisper-port"
          type="number"
          className="input input-bordered w-full"
          value={config.whisper.serverPort}
          onChange={(e) =>
            onChange({
              ...config,
              whisper: {
                ...config.whisper,
                serverPort: parseInt(e.target.value),
              },
            })
          }
        />
      </>
    )}

    {/* Advanced Settings */}
    <div className="col-span-2 divider text-gray-500">Advanced</div>

    <label className="font-bold text-gray-300" htmlFor="whisper-system-prompt">
      System Prompt
    </label>
    <textarea
      id="whisper-system-prompt"
      className="textarea textarea-bordered w-full h-24"
      placeholder="Optional: Context, vocabulary..."
      value={config.whisper.systemPrompt || ''}
      onChange={(e) =>
        onChange({
          ...config,
          whisper: { ...config.whisper, systemPrompt: e.target.value },
        })
      }
    />

    <label className="font-bold text-gray-300" htmlFor="whisper-extra-args">
      Extra Arguments
    </label>
    <input
      id="whisper-extra-args"
      type="text"
      className="input input-bordered w-full font-mono text-sm"
      placeholder="e.g. --ov-e-device GPU or -t 8"
      value={config.whisper.extraArgs || ''}
      onChange={(e) =>
        onChange({
          ...config,
          whisper: { ...config.whisper, extraArgs: e.target.value },
        })
      }
    />
  </div>
);
