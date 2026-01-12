# コーディング規約

本プロジェクトのコーディング規約です。開発にあたっては本規約を遵守してください。

## 1. 全般

- **言語**: TypeScript (可能な限り最新の機能を利用)
- **文字コード**: UTF-8 (BOMなし)
- **改行コード**: LF (Git設定で自動変換推奨)

## 2. ツール・設定

### Lint & Format

本プロジェクトでは ESLint と Prettier を使用します。

- **ESLint**: 静的解析を行い、バグや好ましくない記述を検出します。
  - 変更を加える際は、必ず `npm run lint` を実行し、エラーがないことを確認してください。
  - `any` 型の使用は極力避けてください (`no-explicit-any` 推奨)。
- **Prettier**: コードの自動フォーマットを行います。
  - コードを保存する際、またはコミットする前に `npm run format` を実行してスタイルを統一してください。
  - エディタの "Format on Save" 機能を有効にすることを推奨します。

### 設定ファイル

- `.eslintrc.json`: ESLint 設定
- `.prettierrc`: Prettier 設定
  - Tab width: 2
  - Semicolons: Always
  - Quotes: Single
  - Trailing Comma: All (ES5だけでなく全てにカンマを付与)
  - Print Width: 100
  - End of Line: LF
  - Arrow Parens: Always

### CSS Framework

- **Tailwind CSS v4**: スタイリングに使用します。
  - 設定は CSS ファースト (`src/style.css` 内の `@theme` 等) で行います。
  - 従来の `@tailwind` ディレクティブは使用せず、`@import "tailwindcss"` を使用してください。
- **DaisyUI v5**: UI コンポーネントライブラリとして使用します。
  - `src/style.css` にて `@plugin "daisyui"` で読み込みます。

## 3. 命名規則

- **ファイル名**:
  - Reactコンポーネント: `PascalCase.tsx` (例: `AudioVisualizer.tsx`)
  - クラス定義: `PascalCase.ts` (例: `ConfigManager.ts`)
  - その他ユーティリティ・関数など: `camelCase.ts` (例: `audioUtils.ts`)
- **変数・関数**: `camelCase` (例: `calculateTotal`, `fetchData`)
- **Reactコンポーネント**: `PascalCase` (例: `Button`, `MainPage`)
- **定数**: `UPPER_SNAKE_CASE` (例: `MAX_RETRY_COUNT`, `API_ENDPOINT`)
- **インターフェース/型**: `PascalCase` (例: `UserConfig`, `AudioData`)
  - インターフェース名にプレフィックス `I` は付けない (例: `IUser` はNG、`User` とする)

## 4. コーディングスタイル

- **コンポーネント定義**: 関数コンポーネントを使用する。
  ```tsx
  const MyComponent = () => {
    return <div>...</div>;
  };
  ```
- **Hooks**: カスタムフックは `use` プレフィックスを付ける (例: `useAudio`).
- **非同期処理**: `Promise` チェーン (`.then()`) よりも `async/await` を使用する。
- **型安全性**: 暗黙の `any` を避け、可能な限り具体的な型を定義する。

## 5. ディレクトリ構成

- `src/components`: UIコンポーネント
- `src/hooks`: カスタムフック
- `src/managers`: ビジネスロジック、状態管理クラス、シングルトンなど
- `src/types`: 型定義 (必要に応じて共通の型を配置)
- `src/utils`: ユーティリティ関数
- `src/assets`: 画像、フォントなどの静的アセット

## 6. コメント

- **言語**: **英語** (GitHub公開のため)
- **記述方針**:
  - 複雑なロジックや、一見して意図が分かりにくい箇所には必ずコメントを記述する。
  - JSDoc形式 (`/** ... */`) を推奨。
  - 関数の役割、引数、戻り値について説明する。

## 7. 開発プロセス

1. **実装**: コードを変更する。
2. **フォーマット**: `npm run format` を実行する。
3. **Lint**: `npm run lint` を実行し、エラーを修正する。
4. **テスト**: 既存のテスト (`npm test`) が通ることを確認する (可能な範囲で)。
5. **コミット**: 変更内容を分かりやすくコミットメッセージに記述する。
