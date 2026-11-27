import React from 'react';
import { AppConfig } from '../../types/config';

interface LlmSettingsTabProps {
  config: AppConfig;
  isLoading: boolean;
  onChange: (nextConfig: AppConfig) => void;
  onFetchGroqModels: () => void;
}

export const LlmSettingsTab: React.FC<LlmSettingsTabProps> = ({
  config,
  isLoading,
  onChange,
  onFetchGroqModels,
}) => {
  const getGroqOptions = () => {
    const list = config.llm.groqModels || [];
    return Array.from(new Set(['auto', ...list]));
  };

  return (
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
        onChange={(e) => {
          const nextProvider = e.target.value as 'groq' | 'openai' | 'plamo-local';
          onChange({
            ...config,
            llm: {
              ...config.llm,
              provider: nextProvider,
              model:
                nextProvider === 'plamo-local'
                  ? 'plamo-3-translate-0.8b'
                  : nextProvider === 'groq'
                    ? 'auto'
                    : config.llm.model,
            },
          });
        }}
      >
        <option value="plamo-local">PLaMo 3 Translate (Local WebGPU / Wllama)</option>
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
              onChange({
                ...config,
                llm: { ...config.llm, baseUrl: e.target.value },
              })
            }
          />
        </>
      )}

      {/* API Key */}
      {config.llm.provider !== 'plamo-local' && (
        <>
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
              onChange({
                ...config,
                llm: { ...config.llm, apiKey: e.target.value },
              })
            }
          />
        </>
      )}

      {/* Model */}
      <label className="font-bold text-gray-300" htmlFor="llm-model">
        Model
      </label>
      {config.llm.provider === 'plamo-local' ? (
        <div className="flex flex-col gap-2 w-full">
          <select
            id="llm-model"
            className="select select-bordered w-full"
            value={
              config.llm.model === 'plamo-3-translate-2b'
                ? 'plamo-3-translate-2b'
                : 'plamo-3-translate-0.8b'
            }
            onChange={(e) =>
              onChange({
                ...config,
                llm: { ...config.llm, model: e.target.value },
              })
            }
          >
            <option value="plamo-3-translate-0.8b">
              PLaMo 3 Translate 0.8B (Q4_K_M / ~546MB / Fast)
            </option>
            <option value="plamo-3-translate-2b">
              PLaMo 3 Translate 2B (Q4_K_M / ~1.3GB / High Quality)
            </option>
          </select>
          <div className="flex items-center justify-between text-xs text-gray-400 bg-gray-800/80 border border-gray-700 rounded-md px-3 py-1.5">
            <span>
              <strong>Built with PLaMo</strong> (Preferred Networks, Inc.)
            </span>
            <a
              href="https://plamo.preferredai.jp/info/plamo-community-license-ja"
              target="_blank"
              rel="noreferrer"
              className="link link-primary"
            >
              PLaMo Community License
            </a>
          </div>
        </div>
      ) : config.llm.provider === 'groq' ? (
        <div className="flex flex-col gap-1 w-full">
          <div className="flex gap-2 w-full">
            <select
              id="llm-model"
              className="select select-bordered w-full"
              value={config.llm.model}
              onChange={(e) =>
                onChange({
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
              onClick={onFetchGroqModels}
              disabled={isLoading || !config.llm.apiKey}
              title="Update Model List"
            >
              ↻
            </button>
          </div>
          {(!config.llm.groqModels || config.llm.groqModels.length === 0) && (
            <p className="text-xs text-warning">
              {!config.llm.apiKey
                ? '※ API Key を入力後、右側の更新ボタン（↻）を押してモデル一覧を取得してください。'
                : '※ モデル一覧が未取得です。右側の更新ボタン（↻）を押して取得してください。'}
            </p>
          )}
        </div>
      ) : (
        <input
          id="llm-model"
          type="text"
          className="input input-bordered w-full font-mono text-sm"
          value={config.llm.model}
          placeholder="e.g. gpt-4o, qwen2.5"
          onChange={(e) =>
            onChange({
              ...config,
              llm: { ...config.llm, model: e.target.value },
            })
          }
        />
      )}

      {/* Fallback to PLaMo Local (Groq only) */}
      {config.llm.provider === 'groq' && (
        <>
          <label className="font-bold text-gray-300" htmlFor="llm-fallback-plamo">
            Auto Fallback
          </label>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                id="llm-fallback-plamo"
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={Boolean(config.llm.fallbackToPlamoLocal)}
                onChange={(e) =>
                  onChange({
                    ...config,
                    llm: {
                      ...config.llm,
                      fallbackToPlamoLocal: e.target.checked,
                    },
                  })
                }
              />
              <span className="text-sm text-gray-300">
                Groq のトークン制限 (429) 時に PLaMo 0.8B (Local) で続行する
              </span>
            </label>
            <p className="text-xs text-gray-400">
              有効にすると、Groq がレート制限に達した際にローカルの PLaMo 3 Translate 0.8B
              へ自動で切り替えて翻訳を継続します（一定時間後に Groq への復帰を再試行します）。
            </p>
          </div>
        </>
      )}

      {/* Streaming Display */}
      <label className="font-bold text-gray-300" htmlFor="llm-streaming-display">
        Streaming Display
      </label>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            id="llm-streaming-display"
            type="checkbox"
            className="toggle toggle-primary toggle-sm"
            checked={Boolean(config.translation?.streamingDisplay)}
            onChange={(e) =>
              onChange({
                ...config,
                translation: {
                  ...config.translation,
                  streamingDisplay: e.target.checked,
                },
              })
            }
          />
          <span className="text-sm text-gray-300">
            翻訳テキストをリアルタイムに逐次表示する（Groq / OpenAI 互換）
          </span>
        </label>
        <p className="text-xs text-gray-400">
          有効にすると LLM の生成に合わせてオーバーレイ字幕が 1 文字ずつ流れます（ローカル WebGPU
          は一括表示のまま動作します）。
        </p>
      </div>
    </div>
  );
};
