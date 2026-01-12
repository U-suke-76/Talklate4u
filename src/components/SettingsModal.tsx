import React, { useEffect, useState } from 'react';

import { GlossarySettings, GlossaryEntry } from './GlossarySettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onLog?: (msg: string) => void;
}

interface AppConfig {
  whisper: {
    model: string;
    serverPort: number;
    language: string;
    extraArgs?: string;
    binPath?: string;
    systemPrompt?: string;
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

interface WhisperModel {
  value: string;
  name: string;
  exists: boolean;
}

interface MicrophoneEntry {
  deviceId: string;
  label: string;
}

const DEFAULT_CONFIG: AppConfig = {
  whisper: {
    model: 'ggml-base.bin',
    serverPort: 8081,
    language: 'ja',
    extraArgs: '',
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

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onLog,
}) => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [models, setModels] = useState<WhisperModel[]>([]);
  const [allMics, setAllMics] = useState<MicrophoneEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'glossary'>('general');

  const loadData = React.useCallback(async () => {
    const current = await window.electronAPI.loadConfig();
    if (current) {
      // Logic to migrate old 'groq' config to 'llm' if needed
      // Check if 'groq' exists in current but 'llm' does not (or is empty in file)
      // Note: 'current' is the raw object from disk.

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

      const merged: AppConfig = {
        ...DEFAULT_CONFIG,
        ...current,
        llm: migratedLLM || (current as AppConfig).llm || DEFAULT_CONFIG.llm,
        translation: (current as AppConfig).translation || DEFAULT_CONFIG.translation,
        vad: { ...DEFAULT_CONFIG.vad, ...((current as AppConfig).vad || {}) },
        glossary: (current as AppConfig).glossary || [],
      };

      setConfig(merged);
    }
    const m = (await window.electronAPI.getWhisperModels()) as WhisperModel[];
    setModels(m);

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Mic ${d.deviceId.slice(0, 4)}`,
      }));
    setAllMics(mics);
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
    // If we have fetched models, use them. Merge with defaults to ensure currently selected is there?
    // Actually user wanted "fetched list to be used".
    // Let's use fetched list if available, otherwise defaults.
    // Also ensure current model is in the list to avoid hidden selection.

    const list =
      config.llm.groqModels && config.llm.groqModels.length > 0 ? config.llm.groqModels : defaults;

    // Unique. Add 'auto' at the beginning.
    // Prioritize fetched/sorted list over defaults
    return Array.from(new Set(['auto', ...list, ...defaults]));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await window.electronAPI.saveConfig(config);

      const res = await window.electronAPI.restartWhisper();
      if (res.error) {
        const msg = `Error starting Whisper: ${res.error}`;
        console.error(msg);
        if (onLog) {
          onLog(msg);
          onLog('Please check your settings in the menu.');
        } else {
          alert(msg + '\n\nPlease check your settings.');
        }
      } else {
        onSaved();
        onClose();
      }
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
      {/* Whisper Config */}
      <div className="col-span-2 divider text-gray-500">Whisper Settings</div>

      {/* Whisper Provider */}
      <label className="font-bold text-gray-300" htmlFor="whisper-provider">
        Whisper Provider
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
              // Reset model to default when switching? Maybe not necessary but cleaner
              model:
                e.target.value === 'groq'
                  ? 'whisper-large-v3-turbo'
                  : e.target.value === 'local'
                    ? 'ggml-base.bin'
                    : 'whisper-1',
            },
          })
        }
      >
        <option value="local">Local (whisper.cpp)</option>
        <option value="groq">Groq API</option>
        <option value="openai">OpenAI API</option>
      </select>

      {/* API Key (Remote only) */}
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
              setConfig({
                ...config,
                whisper: { ...config.whisper, apiKey: e.target.value },
              })
            }
          />
        </>
      )}

      {/* Base URL (OpenAI only) */}
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

      <label className="font-bold text-gray-300" htmlFor="whisper-model">
        Whisper Model
      </label>

      {config.whisper.provider === 'groq' ? (
        <select
          id="whisper-model"
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
      ) : config.whisper.provider === 'openai' ? (
        <input
          id="whisper-model"
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
      ) : (
        <select
          id="whisper-model"
          className="select select-bordered w-full"
          value={config.whisper.model}
          onChange={(e) =>
            setConfig({
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

      {/* Local Only Settings */}
      {(!config.whisper.provider || config.whisper.provider === 'local') && (
        <>
          <label className="font-bold text-gray-300" htmlFor="whisper-bin-path">
            Whisper Server Path (Optional)
          </label>
          <input
            id="whisper-bin-path"
            type="text"
            className="input input-bordered w-full font-mono text-sm"
            placeholder="Absolute path to whisper-server.exe (Leave empty for built-in)"
            value={config.whisper.binPath || ''}
            onChange={(e) =>
              setConfig({
                ...config,
                whisper: { ...config.whisper, binPath: e.target.value },
              })
            }
          />
          <div className="col-span-2 text-xs text-gray-500 mb-2">
            Use this to specify a custom version (e.g., CUDA/GPU version). If empty, the built-in
            CPU version will be used.
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
              setConfig({
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

      <label className="font-bold text-gray-300" htmlFor="whisper-language">
        Speech Recognition Language (Source)
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

      <label className="font-bold text-gray-300" htmlFor="whisper-system-prompt">
        System Prompt (Advanced)
      </label>
      <textarea
        id="whisper-system-prompt"
        className="textarea textarea-bordered w-full h-24"
        placeholder="Optional: Context, vocabulary, or style instructions (e.g. 'This is a discussion about medical terms.')"
        value={config.whisper.systemPrompt || ''}
        onChange={(e) =>
          setConfig({
            ...config,
            whisper: { ...config.whisper, systemPrompt: e.target.value },
          })
        }
      />
      <div className="col-span-2 text-xs text-gray-500 mb-2">
        Guides the speech recognition to better understand specific words or context.
      </div>

      <label className="font-bold text-gray-300" htmlFor="whisper-extra-args">
        Extra Arguments (Advanced)
      </label>
      <input
        id="whisper-extra-args"
        type="text"
        className="input input-bordered w-full font-mono text-sm"
        placeholder="e.g. --ov-e-device GPU or -t 8"
        value={config.whisper.extraArgs || ''}
        onChange={(e) =>
          setConfig({
            ...config,
            whisper: { ...config.whisper, extraArgs: e.target.value },
          })
        }
      />
      <div className="col-span-2 text-xs text-gray-500 mb-2">
        ⚠ Caution: Incorrect arguments may prevent the server from starting. Check whisper-server
        --help.
      </div>

      {/* VAD Config */}
      <div className="col-span-2 divider text-gray-500">VAD Settings</div>

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
      <div className="col-span-2 text-xs text-gray-500 mb-2">
        Ignores low volume levels. 0% to disable. ~15% filters out background noise
      </div>

      <div className="col-span-2 divider text-gray-500">LLM API Settings</div>

      {/* Provider Selection */}
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

      {/* Base URL (Only for OpenAI Compatible) */}
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

      {/* Model Selection */}
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
        {allMics.map((mic) => (
          <option key={mic.deviceId} value={mic.label}>
            {mic.label}
          </option>
        ))}
      </select>
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
            className={`tab ${activeTab === 'glossary' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('glossary')}
          >
            Glossary
          </a>
        </div>

        {activeTab === 'general' && renderGeneralTab()}
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
