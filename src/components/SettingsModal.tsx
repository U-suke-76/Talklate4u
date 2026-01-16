import React, { useEffect, useState } from 'react';

import { GlossarySettings, GlossaryEntry } from './GlossarySettings';
import { MicrophoneDevice } from '../hooks/useMicrophone';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onLog?: (msg: string) => void;
  availableMics: MicrophoneDevice[];
}

interface AppConfig {
  whisper: {
    model: string;
    models?: Record<string, string>;
    language: string;
    device?: 'webgpu' | 'wasm';
    provider?: 'local' | 'groq' | 'openai';
    apiKey?: string;
    baseUrl?: string;
  };
  llm: {
    provider: 'groq' | 'openai';
    baseUrl?: string;
    apiKey: string;
    model: string;
    groqModels?: string[];
  };
  translation: {
    targetLang: string;
  };
  app: { defaultMicName: string };

  vad: {
    silenceDurationMs: number;
    positiveSpeechThreshold: number;
    negativeSpeechThreshold: number;
    minSpeechMs: number;
    volumeThreshold?: number;
  };
  glossary?: GlossaryEntry[];
}

const DEFAULT_CONFIG: AppConfig = {
  whisper: {
    model: 'Xenova/whisper-small',
    models: {
      ja: 'Xenova/whisper-small',
      en: 'Xenova/whisper-small',
      default: 'Xenova/whisper-small',
    },
    language: 'auto',
    device: 'wasm',
    provider: 'local',
    apiKey: '',
    baseUrl: '',
  },
  llm: { provider: 'groq', apiKey: '', model: 'llama-3.3-70b-versatile' },
  translation: { targetLang: 'auto' },
  app: { defaultMicName: '' },

  vad: {
    silenceDurationMs: 500,
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    minSpeechMs: 250,
    volumeThreshold: 0,
  },
  glossary: [],
};

const SUGGESTED_MODELS = [
  'onnx-community/whisper-large-v3-turbo',
  'onnx-community/kotoba-whisper-v2.2-ONNX',
  'Xenova/whisper-large-v3',
  'Xenova/whisper-medium',
  'Xenova/whisper-small',
  'Xenova/whisper-tiny',
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onLog,
  availableMics,
}) => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'whisper' | 'llm' | 'vad' | 'glossary'>(
    'general',
  );

  const loadData = React.useCallback(async () => {
    const current = await window.electronAPI.loadConfig();
    if (current) {
      // Logic to migrate old 'groq' config to 'llm' if needed
      interface LegacyConfig {
        groq?: { apiKey?: string; model?: string };
        llm?: AppConfig['llm'];
      }
      const rawConfig = current as LegacyConfig;
      let migratedLLM = rawConfig.llm;

      // Simple migration check: if current has groq and no llm
      if (!migratedLLM && rawConfig.groq) {
        migratedLLM = {
          provider: 'groq',
          apiKey: rawConfig.groq.apiKey || '',
          model: rawConfig.groq.model || 'llama-3.3-70b-versatile',
          groqModels: [],
        };
      }

      // Ensure models map exists
      const whisperConfig = (current as AppConfig).whisper || DEFAULT_CONFIG.whisper;
      if (!whisperConfig.models) {
        whisperConfig.models = { ...DEFAULT_CONFIG.whisper.models };
      }

      const merged: AppConfig = {
        ...DEFAULT_CONFIG,
        ...current,
        whisper: whisperConfig,
        llm: migratedLLM || (current as AppConfig).llm || DEFAULT_CONFIG.llm,
        translation: (current as AppConfig).translation || DEFAULT_CONFIG.translation,
        vad: { ...DEFAULT_CONFIG.vad, ...((current as AppConfig).vad || {}) },
        glossary: (current as AppConfig).glossary || [],
      };

      setConfig(merged);
    }
    // We don't fetch models via IPC anymore since it's local only.
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleFetchGroqModels = async () => {
    if (!config.llm.apiKey) {
      alert('API Key is required to fetch models.');
      return;
    }
    setIsLoading(true);
    try {
      const models = await window.electronAPI.getGroqModels(config.llm.apiKey);
      if (models && models.length > 0) {
        setConfig((prev) => ({
          ...prev,
          llm: { ...prev.llm, groqModels: models },
        }));
        alert(`Fetched ${models.length} models.`);
      } else {
        alert('No models found matching criteria.');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to fetch models: ' + String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const getGroqOptions = () => {
    const defaults = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
    const list =
      config.llm.groqModels && config.llm.groqModels.length > 0 ? config.llm.groqModels : defaults;
    return Array.from(new Set(['auto', ...list, ...defaults]));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await window.electronAPI.saveConfig(config);
      // Restart Whisper implies reloading the model in Renderer.
      // checkServer will detect changes or we can trigger a reload.
      // Since it's in-process, we might not need an explicit "restart" IPC call anymore for Whisper,
      // but we do for Overlay/VAD potentially?
      // Let's keep the existing flow; the Renderer components (RecognitionManager) react to config usage.

      // Update: useServerStatus or RecognitionManager checks config on demand or we trigger reload?
      // RecognitionManager doesn't auto-reload on config save unless we tell it.
      // BUT, app reload isn't needed if we just update state.
      // For now, simple save is enough. useServerStatus checks server status.

      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      const msg = 'Failed to save settings: ' + String(e);
      if (onLog) onLog(msg);
      else alert(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const renderGeneralTab = () => (
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
          setConfig({
            ...config,
            app: { ...config.app, defaultMicName: e.target.value },
          })
        }
      >
        <option value="" disabled>
          Select Microphone
        </option>
        {availableMics.map((mic) => (
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
          setConfig({
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
          setConfig({
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

  const renderWhisperTab = () => (
    <div className="py-4 grid grid-cols-[140px_1fr] gap-4 items-center">
      <div className="col-span-2 text-lg font-bold text-gray-300 mb-2">Speech Recognition</div>

      {/* Whisper Provider */}
      <label className="font-bold text-gray-300" htmlFor="whisper-provider">
        Provider
      </label>
      <select
        id="whisper-provider"
        className="select select-bordered w-full"
        value={config.whisper.provider || 'local'}
        onChange={(e) =>
          setConfig({
            ...config,
            whisper: {
              ...config.whisper,
              provider: e.target.value as 'local' | 'groq' | 'openai',
            },
          })
        }
      >
        <option value="local">Local (Transformers.js)</option>
        <option value="groq">Groq API</option>
        <option value="openai">OpenAI API</option>
      </select>

      {/* Local (Transformers.js) Settings */}
      {config.whisper.provider === 'local' && (
        <>
          <div className="col-span-2 text-sm text-gray-500 mb-4 bg-gray-800 p-3 rounded">
            Runs locally in your browser using WebGPU. No data is sent to external servers.
          </div>

          {/* Device Selection */}
          <label className="font-bold text-gray-300">Device</label>
          <select
            className="select select-bordered w-full mb-4"
            value={config.whisper.device || 'webgpu'}
            onChange={(e) =>
              setConfig({
                ...config,
                whisper: { ...config.whisper, device: e.target.value as 'webgpu' | 'wasm' },
              })
            }
          >
            <option value="webgpu">GPU (WebGPU) - Faster (Unstable on some PCs)</option>
            <option value="wasm">CPU (WASM) - Slower but Stable</option>
          </select>

          <label className="font-bold text-gray-300" htmlFor="model-ja">
            Japanese Model
          </label>
          <div className="flex flex-col gap-1">
            <input
              type="text"
              list="model-suggestions"
              className="input input-bordered w-full"
              value={config.whisper.models?.ja || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  whisper: {
                    ...config.whisper,
                    models: { ...config.whisper.models, ja: e.target.value },
                  },
                })
              }
            />
            <div className="text-xs text-secondary">
              Recommended: onnx-community/kotoba-whisper-v2.2-ONNX
            </div>
          </div>

          {/* Multilingual / Other Model */}
          <label className="font-bold text-gray-300" htmlFor="model-default">
            Other Languages
          </label>
          <div className="flex flex-col gap-1">
            <input
              type="text"
              list="model-suggestions"
              className="input input-bordered w-full"
              value={config.whisper.models?.default || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  whisper: {
                    ...config.whisper,
                    models: { ...config.whisper.models, default: e.target.value },
                  },
                })
              }
            />
            <div className="text-xs text-secondary">
              Recommended: onnx-community/whisper-large-v3-turbo
            </div>
          </div>

          <datalist id="model-suggestions">
            {SUGGESTED_MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </>
      )}

      {/* Cloud (Groq/OpenAI) Settings */}
      {(config.whisper.provider === 'groq' || config.whisper.provider === 'openai') && (
        <>
          <div className="col-span-2 text-sm text-gray-500 mb-4 bg-gray-800 p-3 rounded">
            Uses external APIs for transcription. Requires an API Key.
          </div>

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
              setConfig({
                ...config,
                whisper: { ...config.whisper, apiKey: e.target.value },
              })
            }
          />

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
                  setConfig({
                    ...config,
                    whisper: { ...config.whisper, baseUrl: e.target.value },
                  })
                }
              />
            </>
          )}

          <label className="font-bold text-gray-300" htmlFor="whisper-model-cloud">
            Model ID
          </label>
          {config.whisper.provider === 'groq' ? (
            <select
              id="whisper-model-cloud"
              className="select select-bordered w-full"
              value={config.whisper.model}
              onChange={(e) =>
                setConfig({
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
          ) : (
            <input
              id="whisper-model-cloud"
              type="text"
              className="input input-bordered w-full"
              value={config.whisper.model}
              placeholder="whisper-1"
              onChange={(e) =>
                setConfig({
                  ...config,
                  whisper: { ...config.whisper, model: e.target.value },
                })
              }
            />
          )}
        </>
      )}
    </div>
  );

  const renderLLMTab = () => (
    <div className="py-4 grid grid-cols-[140px_1fr] gap-4 items-center">
      <div className="col-span-2 text-lg font-bold text-gray-300 mb-2">LLM Settings</div>

      {/* Provider */}
      <label className="font-bold text-gray-300" htmlFor="llm-provider">
        Provider
      </label>
      <select
        id="llm-provider"
        className="select select-bordered w-full"
        value={config.llm.provider}
        onChange={(e) =>
          setConfig({
            ...config,
            llm: {
              ...config.llm,
              provider: e.target.value as 'groq' | 'openai',
            },
          })
        }
      >
        <option value="groq">Groq (Recommended)</option>
        <option value="openai">OpenAI Compatible (Ollama/LM Studio)</option>
      </select>

      {/* Base URL (OpenAI) */}
      {config.llm.provider === 'openai' && (
        <>
          <label className="font-bold text-gray-300" htmlFor="llm-base-url">
            Base URL
          </label>
          <input
            id="llm-base-url"
            type="text"
            className="input input-bordered w-full font-mono text-sm"
            value={config.llm.baseUrl || ''}
            placeholder="e.g. http://localhost:11434/v1"
            onChange={(e) =>
              setConfig({
                ...config,
                llm: { ...config.llm, baseUrl: e.target.value },
              })
            }
          />
        </>
      )}

      {/* API Key */}
      <label className="font-bold text-gray-300" htmlFor="llm-api-key">
        API Key
      </label>
      <input
        id="llm-api-key"
        type="password"
        className="input input-bordered w-full font-mono text-sm"
        value={config.llm.apiKey}
        placeholder={config.llm.provider === 'groq' ? 'gsk_...' : 'sk-...'}
        onChange={(e) =>
          setConfig({
            ...config,
            llm: { ...config.llm, apiKey: e.target.value },
          })
        }
      />

      {/* Model */}
      <label className="font-bold text-gray-300" htmlFor="llm-model">
        Model
      </label>
      {config.llm.provider === 'groq' ? (
        <div className="flex gap-2">
          <select
            id="llm-model"
            className="select select-bordered w-full"
            value={config.llm.model}
            onChange={(e) =>
              setConfig({
                ...config,
                llm: { ...config.llm, model: e.target.value },
              })
            }
          >
            {getGroqOptions().map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm btn-secondary"
            onClick={handleFetchGroqModels}
            disabled={isLoading || !config.llm.apiKey}
            title="Update Model List"
          >
            ↻
          </button>
        </div>
      ) : (
        <input
          id="llm-model"
          type="text"
          className="input input-bordered w-full font-mono text-sm"
          value={config.llm.model}
          placeholder="e.g. gpt-4o, qwen2.5"
          onChange={(e) =>
            setConfig({
              ...config,
              llm: { ...config.llm, model: e.target.value },
            })
          }
        />
      )}
    </div>
  );

  const renderVADTab = () => (
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
          setConfig({
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
          setConfig({
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
          setConfig({
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
          setConfig({
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
            setConfig({
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

  return (
    <div className="modal modal-open">
      <div className="modal-box bg-base-800 border border-gray-700 w-11/12 max-w-3xl">
        <h3 className="font-bold text-lg text-primary mb-4">Settings</h3>

        <div role="tablist" className="tabs tabs-boxed bg-gray-900 mb-4">
          <a
            role="tab"
            className={`tab ${activeTab === 'general' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </a>
          <a
            role="tab"
            className={`tab ${activeTab === 'whisper' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('whisper')}
          >
            Speech (Whisper)
          </a>
          <a
            role="tab"
            className={`tab ${activeTab === 'llm' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('llm')}
          >
            LLM
          </a>
          <a
            role="tab"
            className={`tab ${activeTab === 'vad' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('vad')}
          >
            VAD
          </a>
          <a
            role="tab"
            className={`tab ${activeTab === 'glossary' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('glossary')}
          >
            Glossary
          </a>
        </div>

        {activeTab === 'general' && renderGeneralTab()}
        {activeTab === 'whisper' && renderWhisperTab()}
        {activeTab === 'llm' && renderLLMTab()}
        {activeTab === 'vad' && renderVADTab()}
        {activeTab === 'glossary' && (
          <GlossarySettings
            entries={config.glossary || []}
            onChange={(entries) => setConfig({ ...config, glossary: entries })}
          />
        )}

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isLoading}>
            {isLoading ? <span className="loading loading-spinner"></span> : 'Save & Restart'}
          </button>
        </div>
      </div>
    </div>
  );
};
