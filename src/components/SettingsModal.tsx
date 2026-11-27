import React, { useEffect, useState } from 'react';

import { PlamoLocalService } from '../services/wllama/WllamaEngine';
import {
  AppConfig,
  DEFAULT_CONFIG,
  MicrophoneEntry,
  OverlayStyles,
  WhisperModel,
} from '../types/config';
import { GlossarySettings } from './GlossarySettings';
import { OverlaySettingsComponents } from './OverlaySettingsComponents';
import { GeneralSettingsTab } from './settings/GeneralSettingsTab';
import { LlmSettingsTab } from './settings/LlmSettingsTab';
import { VadSettingsTab } from './settings/VadSettingsTab';
import { WhisperSettingsTab } from './settings/WhisperSettingsTab';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onLog?: (msg: string) => void;
}

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
  const [activeTab, setActiveTab] = useState<
    'general' | 'whisper' | 'llm' | 'vad' | 'glossary' | 'overlay'
  >('general');

  const loadData = React.useCallback(async () => {
    const current = await window.electronAPI.loadConfig();
    if (current) {
      interface LegacyConfig extends Partial<AppConfig> {
        groq?: { apiKey?: string; model?: string };
      }
      const rawConfig = current as LegacyConfig;

      let migratedLLM = rawConfig.llm;
      if (!migratedLLM && rawConfig.groq) {
        migratedLLM = {
          provider: 'groq',
          apiKey: rawConfig.groq.apiKey || '',
          model: rawConfig.groq.model || 'auto',
          groqModels: [],
          fallbackToPlamoLocal: false,
        };
      }

      const merged: AppConfig = {
        ...DEFAULT_CONFIG,
        ...rawConfig,
        llm: migratedLLM || rawConfig.llm || DEFAULT_CONFIG.llm,
        translation: rawConfig.translation || DEFAULT_CONFIG.translation,
        vad: { ...DEFAULT_CONFIG.vad, ...(rawConfig.vad || {}) },
        overlay: {
          ...DEFAULT_CONFIG.overlay,
          ...(rawConfig.overlay || {}),
          styles: {
            ...DEFAULT_CONFIG.overlay.styles,
            ...(rawConfig.overlay?.styles || {}),
          },
        },
        glossary: rawConfig.glossary || [],
        glossaryPacks: rawConfig.glossaryPacks || [],
      };

      setConfig(merged);

      // Auto-fetch Groq models if apiKey is provided but groqModels is empty
      if (
        merged.llm?.provider === 'groq' &&
        merged.llm.apiKey &&
        (!merged.llm.groqModels || merged.llm.groqModels.length === 0)
      ) {
        window.electronAPI
          .getGroqModels(merged.llm.apiKey)
          .then((fetched) => {
            if (fetched && fetched.length > 0) {
              setConfig((prev) => ({
                ...prev,
                llm: {
                  ...prev.llm,
                  groqModels: fetched,
                  model:
                    prev.llm.model !== 'auto' && !fetched.includes(prev.llm.model)
                      ? 'auto'
                      : prev.llm.model,
                },
              }));
            }
          })
          .catch((err) => {
            console.warn('Failed to auto-fetch Groq models on load:', err);
          });
      }
    }
    const m = await window.electronAPI.getWhisperModels();
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
      // Async load on open; state is set after awaiting IPC, not synchronously.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      const fetchedModels = await window.electronAPI.getGroqModels(config.llm.apiKey);
      if (fetchedModels && fetchedModels.length > 0) {
        const currentModel = config.llm.model;
        const modelRemoved = currentModel !== 'auto' && !fetchedModels.includes(currentModel);
        setConfig((prev) => ({
          ...prev,
          llm: {
            ...prev.llm,
            groqModels: fetchedModels,
            model: modelRemoved ? 'auto' : prev.llm.model,
          },
        }));
        if (modelRemoved) {
          alert(
            `Fetched ${fetchedModels.length} models.\nSelected model "${currentModel}" is no longer available. Switched to "auto".`,
          );
        } else {
          alert(`Fetched ${fetchedModels.length} models.`);
        }
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

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await window.electronAPI.saveConfig(config);

      const res = await window.electronAPI.restartWhisper();
      if (res.error) {
        const msg = `Error starting ASR: ${res.error}`;
        console.error(msg);
        if (onLog) {
          onLog(msg);
          onLog('Please check your settings in the menu.');
        } else {
          alert(msg + '\n\nPlease check your settings.');
        }
      } else {
        if (config.llm.provider === 'plamo-local') {
          PlamoLocalService.getInstance()
            .ensureLoaded(config.llm.model, (msg) => {
              window.electronAPI.sendDownloadProgress(msg);
            })
            .then(() => {
              onLog?.(`[PLaMo Local] Model (${config.llm.model}) ready on WebGPU!`);
            })
            .catch((err) => {
              onLog?.(
                `[PLaMo Local] Failed to load model: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        }
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

  return (
    <div className="modal modal-open">
      <div className="modal-box bg-gray-800 border border-gray-700 w-11/12 max-w-3xl">
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
            Whisper
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
            className={`tab ${activeTab === 'overlay' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('overlay')}
          >
            Overlay
          </a>
          <a
            role="tab"
            className={`tab ${activeTab === 'glossary' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('glossary')}
          >
            Glossary
          </a>
        </div>

        {activeTab === 'general' && (
          <GeneralSettingsTab config={config} allMics={allMics} onChange={setConfig} />
        )}
        {activeTab === 'whisper' && (
          <WhisperSettingsTab config={config} models={models} onChange={setConfig} />
        )}
        {activeTab === 'llm' && (
          <LlmSettingsTab
            config={config}
            isLoading={isLoading}
            onChange={setConfig}
            onFetchGroqModels={handleFetchGroqModels}
          />
        )}
        {activeTab === 'vad' && <VadSettingsTab config={config} onChange={setConfig} />}
        {activeTab === 'overlay' && (
          <OverlaySettingsComponents
            styles={config.overlay.styles || (DEFAULT_CONFIG.overlay.styles as OverlayStyles)}
            onChange={(newStyles) =>
              setConfig({
                ...config,
                overlay: { ...config.overlay, styles: newStyles },
              })
            }
          />
        )}
        {activeTab === 'glossary' && (
          <GlossarySettings
            entries={config.glossary || []}
            onChange={(entries) => setConfig({ ...config, glossary: entries })}
            packs={config.glossaryPacks || []}
            onPacksChange={(packs) => setConfig({ ...config, glossaryPacks: packs })}
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
