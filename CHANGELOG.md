<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- refactor: Unified system prompt injection logic in `WhisperManager.ts`.

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
