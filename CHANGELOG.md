<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- feat: Added automatic fallback from Groq Whisper to local SenseVoice-Small (`whisper.fallbackToSenseVoice`) on rate limits (429), with background preloading, exponential backoff cooldown (60s -> 120s), and session-long lock after 3 consecutive 429s (`AsrService.ts`, `WhisperManager.ts`, `config.ts`, `WhisperSettingsTab.tsx`, `tests/unit/AsrServiceFallback.test.ts`).
- feat: Extended streaming translation display (`translation.streamingDisplay`) to local WebGPU `plamo-local` (including Groq 429 fallback) via `@wllama/wllama` `stream: true` + `onData` and `plamo-translate-chunk` IPC, and added live partial translation streaming to the main window `LogViewer` via `translation-partial` IPC (`WllamaEngine.ts`, `main.ts`, `preload.ts`, `electron.d.ts`, `App.tsx`, `useSpeechTranslation.ts`, `TranslationService.ts`, `LlmSettingsTab.tsx`, `tests/unit/WllamaEngine.test.ts`).
- fix: Destroy `MicVAD` instance on `stopVAD()` (`src/hooks/useVAD.ts`) instead of only pausing, preventing microphone `MediaStream` / `AudioContext` leaks when restarting VAD after saving settings.
- feat: Added automatic fallback to local PLaMo 3 Translate 0.8B (`llm.fallbackToPlamoLocal`) when Groq hits rate limits (429), with startup preloading (`PLaMo Standby`), exponential backoff cooldown (60s -> 120s), and session-long lock to PLaMo after 3 consecutive 429s (`TranslationService.ts`, `App.tsx`, `config.ts`, `LlmSettingsTab.tsx`, `tests/unit/TranslationServiceFallback.test.ts`).
- feat: Added streaming translation display (`translation.streamingDisplay`, 50ms throttled OBS overlay updates via `stream: true`) with adapter-level partial output sanitization (`cleanPartialOutput`) and API-level thinking suppression (`extraBody: { reasoning_effort: 'none' }` for Groq Qwen3, `reasoning_effort: 'low'` for Groq GPT-OSS, `chat_template_kwargs: { enable_thinking: false }` for OpenAI-compatible Qwen3) across `ModelAdapter.ts`, `TranslationService.ts`, `config.ts`, and `LlmSettingsTab.tsx`.
- feat: Added automatic post-startup warmup request to `docs/colab/serve_plamo.py` so the first real translation avoids the initial ~3.5s cold-start latency.
- feat: Added translation quality evaluation CLI (`scripts/eval-translation.ts`, `npm run eval:translation`) supporting YouTube transcripts (`.txt`, `.vtt`, `.srt`), external TSV/ZIP glossaries (`TsvGlossaryPack`), and all `ModelAdapter` families including PLaMo 3 Translate (`PlamoAdapter` remote mode via OpenAI-compatible/vLLM endpoints) and Groq, with Markdown/CSV report output and unit tests (`tests/unit/evalTranslation.test.ts`).
- feat: Added multilingual glossary pack import (ZIP bundling multiple TSV files, or plain TSV; `pos\tja\ten\tko\tzh`, slash-separated aliases) to the Glossary settings tab with per-pack enable/disable and delete. ZIP extraction uses the lightweight `fflate` library. Packs are stored in `config.glossaryPacks`, and only terms found in each utterance are injected into LLM prompts via a longest-first, non-overlapping matcher with Hangul/ASCII word-boundary guards (`src/services/glossary/TsvGlossaryPack.ts`, `TranslationService.ts`, `GlossarySettings.tsx`).
- docs: Consolidated agent rules from `.agent/rules/target.md` into root `AGENTS.md`, adding unit test (`npm run test:unit`), OSS glossary privacy, and `git push` safety guidelines.
- docs: Added agent skills `.agent/skills/release-check/SKILL.md` and `.agent/skills/add-model-adapter/SKILL.md`.
- test: Added unit tests for `WllamaEngine` and `PlamoLocalService` (`tests/unit/WllamaEngine.test.ts`) covering default OPFS cache loading, `NoModificationAllowedError`/`removeEntry` fallback to `useCache=false`, non-OPFS error propagation, engine reuse, model switching (`0.8b` -> `2b`), and `fallbackPrompt` execution.
- test: Added Vitest unit test suite (`vitest.config.ts`, `npm run test:unit`) covering `ModelAdapter`, `plamoPrompt`, `PromptFactory`, and `detectLanguage` (`tests/unit/`).

- docs: Added Colab CLI launcher (`docs/colab/start_colab_plamo.sh`) and vLLM server script (`docs/colab/serve_plamo.py`) defaulting to T4 GPU with `pfnet/plamo-3-translate-8b-W4A16`, single-session OpenSSH `ProxyCommand` local port forwarding with live `uv`/`pip` install output, optional Google Drive cache (`USE_DRIVE_CACHE=1`), and verified `colab stop` cleanup; updated `docs/colab/README.md` to use Colab CLI as the primary setup while keeping the browser notebook as a fallback (verified end-to-end on Colab T4 + vLLM 0.34.0).
- docs: Added Google Colab notebook (`docs/colab/plamo3_translate_server.ipynb`) that serves PLaMo 3 Translate 8B as an OpenAI-compatible vLLM server behind a Cloudflare quick tunnel with a generated API key, for manual personal use via the existing `openai` provider (custom Base URL).
- docs: Added `docs/colab/README.md` with setup, usage, shutdown, and troubleshooting steps for the Colab PLaMo 3 Translate server.
- feat: Added local SenseVoice-Small ASR engine (`SenseVoiceManager.ts`) powered by `sherpa-onnx-node` with automatic Hugging Face INT8 model download, non-speech/noise event filtering (`<|nospeech|>`, `Breath`, `Cough`, `BGM`, `Speech_Noise`, short filler/Chinese noise guard), and Japanese intra-sentence space removal.
- feat: Added local PLaMo 3 Translate (0.8B / 2B) WebGPU translation engine (`WllamaEngine.ts`, `src/services/adapters/plamoPrompt.ts`) powered by `@wllama/wllama@3.13.0` with repetition loop removal, short-input hallucination guards, and native PFML3 `context` (recent conversation history) and `glossary` integration.
- ui: Added `SenseVoice-Small` ASR provider and `PLaMo 3 Translate (Local WebGPU)` LLM provider options in `SettingsModal.tsx`.
- docs: Added `Built with PLaMo` attribution and PLaMo Community License notices to `SettingsModal.tsx`, `App.tsx`, `README.md`, `README.ja.md`, and `README.ko.md`.
- docs: Added Architecture Principles (strict separation between LLM Transport Providers and Model-Family Adapters) to `.agent/rules/target.md`.
- refactor: Centralized configuration schemas, TypeScript types, and default values in `src/types/config.ts` and strengthened IPC type definitions in `src/electron.d.ts`.
- refactor: Split `SettingsModal.tsx` into modular tab components (`src/components/settings/GeneralSettingsTab.tsx`, `WhisperSettingsTab.tsx`, `LlmSettingsTab.tsx`, `VadSettingsTab.tsx`).
- refactor: Extracted streaming file download logic with `.part` file handling into `src/utils/FileDownloader.ts` and unified `WhisperManager` and `SenseVoiceManager` behind `src/server/AsrService.ts`.
- refactor: Unified directional glossary matching and target language code resolution across `PromptFactory.ts` and `TranslationService.ts`.
- refactor: Separated LLM transport providers (`plamo-local` WebGPU / `groq` / `openai`) from model-family adapters (`ModelAdapter.ts`: `PlamoAdapter`, `QwenAdapter`, `GemmaAdapter`, `GptOssAdapter`, `StandardChatAdapter`), unifying local WebGPU (`WllamaEngine.ts`) and remote OpenAI-compatible servers (e.g. Bionic / LM Studio / Google Colab `llama-server`) into a single adapter-driven pipeline.
- fix: Normalized OpenAI-compatible ASR and LLM `baseUrl` endpoints (`/v1/models`, `/v1/audio/transcriptions`, `/v1/chat/completions`) in `WhisperManager.ts` and `TranslationService.ts`.

### Security

- chore: Migrated ESLint to v9 Flat Config (`eslint.config.mjs`) with `@typescript-eslint` v8 and aligned `typescript` to `^6.0.x` (`package.json`, `package-lock.json`, `eslint.config.mjs`).
- chore: Upgraded `typescript` to `^7.0.2` and `jimp` to `^2.2.1` (`package.json`, `package-lock.json`).
- chore: Upgraded `react` / `react-dom` (+ `@types`) to `v19`, `electron-store` to `^12.0.0`, and `dotenv` to `^18.0.10` (`package.json`, `package-lock.json`).
- chore: Upgraded `openai` SDK to `^7.65.0` (`package.json`, `package-lock.json`).
- perf: Upgraded `@wllama/wllama` to `4.0.0` for improved local PLaMo 3 Translate WebGPU inference performance, and added `rename: { stripBase: true }` to `viteStaticCopy` targets in `vite.renderer.config.ts` for `vite-plugin-static-copy` v4 compatibility (`package.json`, `package-lock.json`, `vite.renderer.config.ts`).
- chore: Updated minor and patch dependencies via `npm update` (`axios`, `onnxruntime-web`, `sherpa-onnx-node`, `tailwindcss`, `daisyui`, `prettier`, `playwright`, etc.) (`package-lock.json`).
- chore: Upgraded `electron` to `^45.5.0` (Chromium 156 / Node.js 24.22) (`package.json`, `package-lock.json`).
- chore: Upgraded `@electron-forge/*` to `v8.0.1`, `@electron/fuses` to `v2`, `vite` to `v8.4.0`, `vitest` to `v5.1.2`, `@vitejs/plugin-react` to `v6.3.0`, and `vite-plugin-static-copy` to `v4.1.1`, resolving all remaining `npm audit` vulnerabilities (`0 vulnerabilities`). Updated `forge.config.ts` (`PublisherGitHub` export name and `@electron/packager` v21 `afterExtract` hook signature) and `tests/unit/WllamaEngine.test.ts` (Vitest 5 constructor mock syntax).
- chore: Updated `nodejs-whisper` to `0.4.1` to address GHSA-2f48-3555-fpx6 (`package.json`, `package-lock.json`).
- chore: Updated transitive and runtime dependencies via `npm audit fix` (`electron`, `body-parser`, `follow-redirects`, `undici`, `zod`, `fast-uri`, `qs`), reducing reported vulnerabilities from 74 to 39.

### Fixed

- fix: Removed `/no_think` directive from `QwenAdapter` across both Groq and OpenAI-compatible providers, relying on API-level thinking suppression (`reasoning_effort: 'none'` / `chat_template_kwargs: { enable_thinking: false }`) and `<think>` stripping to avoid translation quality degradation (source-language leakage) (`src/services/adapters/ModelAdapter.ts`, `tests/unit/ModelAdapter.test.ts`).

- fix: Fixed `WllamaEngine` default WASM URL (`/wllama/single-thread/wllama.wasm` -> `./wllama.wasm` via `new URL('./wllama.wasm', window.location.href).href`) to match the Vite static copy output and added automatic `useCache: false` fallback when Windows OPFS cache throws `removeEntry` / `NoModificationAllowedError` (`src/services/wllama/WllamaEngine.ts`).
- fix: Preload the PLaMo Local WebGPU model immediately when switching to `plamo-local` in Settings, display a header status badge (`PLaMo Loading...` / `PLaMo Ready` / `PLaMo Error`), and forward download/load progress and inference errors from the renderer to the main process log (`src/App.tsx`).
- fix: `PlamoAdapter` now has `local` / `remote` modes. For remote OpenAI-compatible servers (e.g., Colab vLLM) it sends only the user message with options in `chat_template_kwargs`, because the official PLaMo 3 Translate chat template rejects `system` messages. Local WebGPU behavior is unchanged.
- docs: Made `HF_TOKEN` optional in the Colab PLaMo 3 Translate notebook and README (previously the notebook failed when the secret was not registered).
- docs: Confirmed via Hugging Face API that `pfnet/plamo-3-translate-8b` is not gated (no `HF_TOKEN` needed) and documented that its chat template rejects `system` messages.

## [0.0.6] - 2026-10-17

### Added

- feat: Added sliding conversation history (up to 6 turns / 2-minute TTL) and ASR recognition error recovery instructions in `TranslationService.ts` and `system_prompt.txt` for context-aware translations.
- feat: Added automatic Glossary term injection into Whisper's `initial_prompt` (`prompt` parameter) in `WhisperManager.ts` with safe length clipping and `auto` language exclusion protection.
- feat: Added 2-stage instant subtitle rendering in `TranslationService.ts` and `src/overlay/client.js` to display recognized speech on the OBS overlay immediately (`...`) and update the translation in-place upon LLM completion.
- ui: Added priority reordering buttons (⬆️/⬇️) and Whisper recognition priority guidance tip to `GlossarySettings.tsx`.
- test: Added Main process stdout and stderr logging to Playwright `fixtures.ts` to improve test diagnosability.
- feat: Added dynamic model fetching for Groq with automatic on-demand fetch and background sync in settings.
- ui: Added warning / guidance message under Model selector when models are not yet fetched.

### Changed

- refactor: Changed default LLM model to `auto` and removed hardcoded fallback models (e.g. Llama) to support dynamic cloud model lineups.
- refactor: Added deterministic tie-breaking by name for Groq models with identical parameter counts.
- refactor: Improved short utterance (<10 chars) language detection in `detectLanguage.ts` using Unicode script detection (Hangul, Hiragana/Katakana, ASCII) before falling back to `franc`.
- chore(deps): Moved runtime packages (`axios`, `dotenv`, `electron-log`, `electron-store`, `form-data`, `franc`, `handlebars`, `openai`, `zod`, etc.) from `devDependencies` to `dependencies` in `package.json`.
- chore(deps): Updated Electron from 33 to 44 and `@ricky0123/vad-web` to 0.0.31.
- chore(deps): Updated in-range dependencies (Electron Forge 7.11, socket.io 4.8.4, axios 1.20, openai 6.49, zod 4.6, tailwindcss 4.3, etc.). Resolved all production dependency vulnerabilities reported by `npm audit`.

### Fixed

- security: Escaped HTML entities in recognized/translated text in overlay `client.js` and replaced `dangerouslySetInnerHTML` with safe React node rendering in `OverlaySettingsComponents.tsx` (while preserving `<br>` line breaks in `displayFormat`) to prevent XSS and layout corruption.
- fix: VAD options `minSpeechMs` / `redemptionMs` were passed with obsolete names (`minSpeechFrames` / `redemptionFrames`) and may not have been applied. Now passed with the current `vad-web` option names.
- fix: Removed obsolete `modelURL` / `workletURL` VAD options (no effect with current `vad-web`).
- fix: Added missing overlay style fields to the fallback default config in `ConfigManager`.
- fix: Resolved TypeScript errors (axios header type, overlay styles typing) and `react-hooks/set-state-in-effect` lint errors.
- fix: Fallback selected Groq model to `auto` when the model is no longer present after refetching models.

## [0.0.5] - 2026-06-14

### Added

- feat: Added subtitle limit (maxLines) and automatic fadeout (fadeTimeout) settings.
- feat: Added Custom CSS support for the overlay with a togglable checkbox and CSS code editor, disabling other inputs when active.
- feat: Enabled `dotenv` in Electron Forge config to automatically load `GITHUB_TOKEN` from local `.env` file during publish.

### Changed

- ui: Restructured overlay layout to apply background-color only to text width (inline-block wrapper) instead of full viewport width.

### Fixed

- fix: Added missing aria-label to Custom CSS checkbox to resolve accessibility warning.

## [0.0.4] - 2026-04-18

### Changed

- feat: Added `<think>` tag removal logic and content-based retry loop
  (with temperature increment) in `TranslationService.ts` to support
  Qwen/DeepSeek reasoning models.
- refactor: Unified system prompt injection logic in `WhisperManager.ts`.
- fix: Updated Groq model filtering in `TranslationService.ts`
  (add `meta-llama` and excluded `prompt-guard`).
- ui: Apply translated text color to surrounding brackets/parenthesis in the overlay.
- ui: Changed overlay background color behavior to apply only to subtitle lines.

### Fixed

- fix: System prompt was ignored when using remote Whisper APIs (Groq/OpenAI).

## [0.0.3] - 2026-02-15

### Added

- feat: Added overlay display settings.

### Fixed

- fix: Corrected Settings Modal background color on Light Mode/Default Theme.

## [0.0.2] - 2026-01-12

### Added

- feat: Organized Settings Modal into tabs (General, Appearance, Audio, About).
- feat: add option to route Whisper to Groq or local LLMs.
- docs: Created `CHANGELOG.md`.

### Changed

- refactor: Refactored codebase and applied development standards (Lint/Format).
- ui: Updated Help URL to point to the correct GitHub page.

### Fixed

- fix: VAD model file loading issues (static copy configuration).
- fix: restore missing log file output.
- fix: apply VAD settings updates after startup.
