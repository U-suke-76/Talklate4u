<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- feat: Added dynamic model fetching for Groq with automatic on-demand fetch and background sync in settings.
- ui: Added warning / guidance message under Model selector when models are not yet fetched.

### Changed

- refactor: Changed default LLM model to `auto` and removed hardcoded fallback models (e.g. Llama) to support dynamic cloud model lineups.
- refactor: Added deterministic tie-breaking by name for Groq models with identical parameter counts.
- chore(deps): Updated Electron from 33 to 44 and `@ricky0123/vad-web` to 0.0.31.
- chore(deps): Updated in-range dependencies (Electron Forge 7.11, socket.io 4.8.4, axios 1.20, openai 6.49, zod 4.6, tailwindcss 4.3, etc.). Resolved all production dependency vulnerabilities reported by `npm audit`.

### Fixed

- fix: VAD options `minSpeechMs` / `redemptionMs` were passed with obsolete names (`minSpeechFrames` / `redemptionFrames`) and may not have been applied. Now passed with the current `vad-web` option names.
- fix: Removed obsolete `modelURL` / `workletURL` VAD options (no effect with current `vad-web`).
- fix: Added missing overlay style fields to the fallback default config in `ConfigManager`.
- fix: Resolved TypeScript errors (axios header type, overlay styles typing) and `react-hooks/set-state-in-effect` lint errors.

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
