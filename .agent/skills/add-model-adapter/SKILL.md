---
name: add-model-adapter
description: >-
  Talklate4u に新しい LLM モデルファミリーのアダプターを追加・更新する手順。
  Transport 層と ModelAdapter 層の厳格な 2 層分離を維持しつつ、単体テストと CHANGELOG を整備する。
---

# Add Model Adapter (Talklate4u)

Talklate4u で新しい LLM モデル（またはプロンプト形式）に対応する際の手順。

## 1. アーキテクチャ原則の確認

- **Transport 層**（`src/services/wllama/WllamaEngine.ts`, `src/services/TranslationService.ts` の OpenAI SDK 呼び出し）にモデル固有のプロンプト構築や出力クリーニングを書かない。
- モデル固有のロジック（`messages`, `stop`, `chat_template_kwargs`, 出力クリーニング等）はすべて **`src/services/adapters/`** に閉じ込める。

## 2. アダプターの実装

1. `src/services/adapters/ModelAdapter.ts` を確認し、`ModelAdapter` インターフェースに沿って新しいアダプタークラスを実装する。
2. モデル名からの自動判定ロジック（`resolveModelAdapter` 等）に新しいモデルファミリーのマッチ条件を追加する。
3. 必要に応じてプロンプトビルダーを `src/services/adapters/` 配下に分離する（例: `plamoPrompt.ts`）。
4. UI でモデルやプロバイダーの選択肢を増やす場合は、`src/types/config.ts` と `src/components/settings/LlmSettingsTab.tsx` を更新する。

## 3. 単体テストの追加・実行

- `tests/unit/ModelAdapter.test.ts`（または専用のテストファイル）に以下を追加する：
  - モデル名からのアダプター解決テスト
  - `buildRequest` のペイロード生成テスト（システムプロンプト、用語集、文脈、stop トークン等）
  - `cleanOutput` の出力クリーニングテスト（思考タグ、余分な前置き、ループ除去など）
- 実行して全件通過を確認する：

```powershell
npm run test:unit
```

## 4. 仕上げ

- `npm run lint` と `npx tsc --noEmit -p .` を実行する。
- `CHANGELOG.md` の `## [Unreleased]` に変更内容を追記する。
- `npm run format` を実行する。
