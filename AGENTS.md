# Project Rules (Talklate4u)

## 1. Project Overview & Role

- You are an expert developer for **Talklate4u** (OSS real-time voice recognition & translation desktop app).
- Before implementation, refer to `docs/requirements.md` to ensure alignment with project objectives and user flow.

## 2. Coding Standards & Tech Stack

- **Formatting Style** (Prettier):
  - Single quotes (`'`)
  - Trailing commas: `"all"` (or `"es5"`)
  - Tab width: 2 spaces
  - Print width: 100 characters
- **TypeScript**: Use strict type checking and actively leverage TypeScript 5.x features. Avoid `any`.
- **UI Stack**: Follow **Tailwind CSS v4** (CSS-first configuration using `@import` instead of `@tailwind` directives) and **DaisyUI v5** components.
- **Quality**: Ensure code is clean, modular, and produces no ESLint errors or warnings.

## 3. Architecture Principles (Transport vs. Model Adapter Separation)

- **Strict 2-Layer Separation**: Always keep **LLM Transport Providers** (`plamo-local` WebGPU / `groq` / `openai`) strictly separated from **Model-Family Adapters** (`src/services/adapters/ModelAdapter.ts`: `PlamoAdapter`, `QwenAdapter`, `GemmaAdapter`, `GptOssAdapter`, `StandardChatAdapter`).
- **Adapter Responsibility**: All model-specific prompt formatting (`messages`, `stop`, `chat_template_kwargs`, `[plamo-translate]` blocks) and output cleaning/filtering MUST live exclusively inside `src/services/adapters/`.
- **Transport Responsibility**: Transport layers (`src/services/wllama/WllamaEngine.ts` and OpenAI SDK calls in `src/services/TranslationService.ts`) MUST remain pure execution pipes that accept `AdapterRequestPayload` and return raw completion strings without any model-specific prompt or cleaning logic. Never duplicate prompt construction or output cleaning across local and remote transports.

## 4. Glossary & OSS Policy

- **No Private Glossary Data in Repo**: Talklate4u is an OSS repository. NEVER commit personal or private domain-specific glossary TSV/ZIP files into this repository.
- Users import custom glossary packs dynamically at runtime via the Glossary settings UI (`src/services/glossary/TsvGlossaryPack.ts`).

## 5. Testing & Verification

- **Unit Tests**: Run `npm run test:unit` (Vitest 3.x — kept on v3 for Vite 5 compatibility) whenever modifying core logic, adapters, or glossary matching, and add/update tests under `tests/unit/`.
- **Lint**: If changes affect **three or more files**, run `npm run lint` to ensure cross-file consistency.
- **Format**: Run (or remind the user to run) `npm run format` after file modifications.
- **Documentation (Mandatory)**: Whenever you make any changes to the codebase or configuration, you **MUST** update `CHANGELOG.md` (under `## [Unreleased]`) in the same turn, following Keep a Changelog conventions.

## 6. Git Operations & Safety Rules

- **Strict `git push` Prohibition**:
  - NEVER execute `git push` autonomously or based on ambiguous/questioning user inputs.
  - `git push` must ONLY be executed when the user provides an **explicit and unambiguous command** to push.
- **Handling Inquiries / Question-Form Inputs**:
  - For questioning or status check inputs, perform only read-only checks (`git status`, `git log`) and report the status textually.
