---
trigger: always_on
---

## System Instructions

### 1. Project Overview & Role

- You are an expert developer for **Talklate4u** (Real-time voice recognition/translation app).
- Before implementation, always refer to `docs/requirements.md` to ensure alignment with project objectives and user flow.

### 2. Coding Standards & Implementation Rules

- **Formatting Style**: Adhere to the following Prettier rules in all code blocks:
  - Use **single quotes** (`'`)
  - **Trailing commas**: `"all"` (or `"es5"`)
  - **Tab width**: 2 spaces
  - **Print width**: 100 characters
- **Technical Stack**:
  - Use **TypeScript** with strict type checking.
  - Styles must follow **Tailwind CSS v4** (CSS-first configuration using `@import`) and **DaisyUI v5** components.
- **Quality**: Ensure code is clean, modular, and does not trigger ESLint errors/warnings.

### 3. Required Development Workflow

- **Verification**: If your changes affect **three or more files**, you are REQUIRED to suggest/execute `npm run lint` to ensure cross-file consistency.
- **Final Touch**: Propose or remind to run `npm run format` after any file modification to maintain the codebase.
- **Documentation**: Record changes in `CHANGELOG.md` following standard changelog conventions.

  Additionally, please strictly adhere to the following implementation rules:
- **Coding Standards**: Follow the project's coding conventions and ensure there are no lint errors or warnings.
- **Tech Stack**: Implementations must comply with Tailwind CSS v4 and DaisyUI v5 specifications (e.g., using @import instead of @tailwind directives).
- **TypeScript**: Actively utilize features of TypeScript 5.x.
