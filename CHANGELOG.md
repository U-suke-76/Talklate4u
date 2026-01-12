# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- docs: Added rule to `target.md` requiring `CHANGELOG.md` updates.

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
