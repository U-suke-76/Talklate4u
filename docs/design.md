# 基本設計書 (Basic Design Document)

## 1. 概要

本ドキュメントは、リアルタイム翻訳・字幕システム「Talklate4u」の基本設計について記述する。
本システムは、配信者（ストリーマー）の発話をリアルタイムで音声認識・翻訳し、OBS 等の配信ソフト上に字幕としてオーバーレイ表示することを目的とする。

## 2. システムアーキテクチャ

### 2.1 全体構成

本アプリケーションは **Electron** フレームワークを採用し、以下の主要コンポーネントで構成される。

1. **Frontend (Renderer Process)**:
   - ユーザーインターフェース (React 19 + Tailwind CSS v4 + DaisyUI v5)。
   - マイク音声の取得と VAD (Voice Activity Detection: `@ricky0123/vad-web`)。
   - **PLaMo Local Engine (`WllamaEngine.ts`)**: `@wllama/wllama` を用いたオンデバイス WebGPU 翻訳実行（`usePlamoLocal` 経由で Main プロセスと IPC 連携）。
   - 設定画面（General / Whisper / LLM / VAD / Overlay / Glossary）。
2. **Backend (Main Process & Internal Services)**:
   - **Main Process (`main.ts`)**: アプリケーションのライフサイクル管理、IPC 通信のハブ。
   - **MenuManager**: ネイティブアプリケーションメニューの構築とイベントハンドリング。
   - **AsrService**: `WhisperManager`（ローカル `whisper-server.exe` / Cloud API）および `SenseVoiceManager`（ローカル `sherpa-onnx-node` INT8）を統合管理し、Groq 429 時の自動フォールバックを制御。
   - **TranslationService**: モデルアダプター層 (`ModelAdapter`) と連携した LLM 翻訳パイプライン、ストリーミング配信、Groq 429 フォールバック、会話履歴管理。
   - **OverlayServer**: 字幕表示用のウェブページを配信するローカル HTTP / Socket.IO サーバー。
3. **External Services (Cloud / Remote)**:
   - Groq Cloud / OpenAI / Ollama / LM Studio / リモート vLLM 等の OpenAI 互換 API。

```mermaid
graph TD
    subgraph "Renderer Process (Frontend)"
        UI[React UI / AppHeader / LogViewer]
        VAD[useVAD (@ricky0123/vad-web)]
        Audio[Microphone Input]
        Wllama[PlamoLocalService (Wllama WebGPU)]
        Audio --> VAD
        VAD -->|WAV Buffer| IPC_Client[IPC Preload]
        Wllama <-->|IPC plamo-translate-*| IPC_Main
    end

    subgraph "Main Process (Backend)"
        IPC_Main[IPC Handler (main.ts)]
        ASR[AsrService]
        WM[WhisperManager]
        SV[SenseVoiceManager]
        TS[TranslationService]
        MA[ModelAdapter / GlossaryResolver]
        RL[RateLimitFallbackController]
        OM[OverlayServer]

        IPC_Client <-->|IPC| IPC_Main
        IPC_Main --> ASR
        IPC_Main --> TS

        ASR --> WM
        ASR --> SV
        ASR --> RL

        TS --> MA
        TS --> RL
        TS --> OM
        TS -->|Fallback / Local| IPC_Main
    end

    subgraph "External / Output"
        Browser[Overlay Browser Source]
        Cloud_API[Groq / OpenAI / Compatible API]

        OM -->|Socket.IO| Browser
        WM <--> Cloud_API
        TS <--> Cloud_API
    end
```

### 2.2 技術スタック

| コンポーネント      | 技術要素                                                             | 用途                                             |
| :------------------ | :------------------------------------------------------------------- | :----------------------------------------------- |
| **Runtime**         | Electron 45, Node.js                                                 | アプリケーション基盤                             |
| **Frontend**        | React 19, Vite 8, Tailwind CSS v4, DaisyUI v5                        | UI 構築                                          |
| **Voice Detection** | `@ricky0123/vad-web`                                                 | ブラウザ上での高精度な発話検知                   |
| **ASR (音声認識)**  | `nodejs-whisper` / `sherpa-onnx-node` (SenseVoice-Small) / Cloud API | ローカル (Whisper / SenseVoice) または Cloud API |
| **Translation**     | `openai` SDK / `@wllama/wllama` (PLaMo 3 Translate)                  | 多言語翻訳 (Cloud / Local LLM / WebGPU)          |
| **Overlay**         | Express 5, Socket.IO                                                 | 字幕配信サーバー                                 |

## 3. 機能設計

### 3.1 音声認識 (ASR) フロー

1. **音声取得**: Renderer プロセスの `useVAD` フックにてマイク入力を監視（アンマウント時に `destroy()` でクリーンアップ）。
2. **発話検知**: 発話区間のみを切り出し、WAV フォーマット（16kHz, Mono, 16bit）に変換。
3. **送信**: `transcribe-audio` IPC を通じて Main プロセスの `AsrService.transcribe()` へ送信。
4. **推論・フォールバック**:
   - **Whisper (`Local` / `Groq` / `OpenAI`)**: `WhisperManager` がローカルサーバーまたは API へ送信。
   - **SenseVoice-Small (`sensevoice`)**: `SenseVoiceManager` がローカル ONNX 推論を実行（非発話イベント除外を含む）。
   - **Groq 429 フォールバック**: `fallbackToSenseVoice` 有効時は `RateLimitFallbackController` により SenseVoice-Small へ自動切り替え（`60s → 120s` → 3回目でセッション固定）。
5. **結果返却**: 認識されたテキスト・言語情報を Renderer へ返却。

### 3.2 翻訳 (Translation) フロー

1. **テキスト受信**: 音声認識結果に対し、`TranslationService.translate()` が呼び出される。
2. **フィルタリング & 段階1表示**: `NOISE_PATTERNS` で幻覚や記号列を除外し、直ちに原文 + `...` (`pending: true`) をオーバーレイへ先行送信。
3. **プロンプト構築 (2層分離)**:
   - `GlossaryResolver`（ユーザー辞書 + TSV/ZIP 用語集パック）と `PromptFactory`、直近会話履歴（最大 6 ターン / TTL 2 分）を取得。
   - `resolveModelAdapter()` が選択モデルに応じた `ModelAdapter`（`PlamoAdapter`, `QwenAdapter`, `GemmaAdapter`, `GptOssAdapter`, `StandardChatAdapter`）を返し、プロンプト構築・思考タグ制御・出力クリーニングを担当。
4. **推論・ストリーミング・フォールバック**:
   - Cloud / OpenAI 互換 API は `openai` SDK、ローカル WebGPU (`plamo-local`) は IPC 経由で `PlamoLocalService`（WebGPU 衝突防止のため直列キュー実行）へ委譲。
   - `translation.streamingDisplay` 有効時は 50ms スロットルでメイン画面 (`translation-partial`) と OBS オーバーレイを更新。
   - Groq HTTP 429 時、`fallbackToPlamoLocal` 有効なら `RateLimitFallbackController` に従い `plamo-3-translate-0.8b` へ自動フォールバック。

### 3.3 オーバーレイ (Overlay)

- **サーバー**: `OverlayServer` クラスが Express サーバーを起動し、`src/overlay/index.html` をホスト。
- **通信**: Socket.IO で接続中のクライアントへ `translation` / `translation_remove` / `style_update` をリアルタイム送信。
- **スタイル**: `Partial<OverlayStyles>` 型で管理し、カスタム CSS も適用可能。

## 4. モジュール詳細設計

### 4.1 ディレクトリ構成 (`src/`)

- **`main.ts`**: アプリケーションのエントリーポイント。各マネージャー・サービスの初期化と IPC ハンドリング。
- **`managers/`**:
  - `ConfigManager.ts`: `electron-store` と Zod スキーマ (`src/types/config.ts`) を用いた設定の読み書き。
  - `MenuManager.ts`: Electron ネイティブメニューの構築と制御。
- **`server/`**:
  - `AsrService.ts`: Whisper / SenseVoice の統合制御、プリロード、429 フォールバック管理。
  - `WhisperManager.ts`: `whisper-server.exe` のダウンロード・起動・Cloud/Local 推論。
  - `SenseVoiceManager.ts`: `sherpa-onnx-node` モデル管理と音声認識・ノイズフィルタ。
  - `OverlayServer.ts`: Express + Socket.IO オーバーレイ配信サーバー。
- **`services/`**:
  - `TranslationService.ts`: 翻訳パイプライン、ストリーミング配信、会話履歴、429 フォールバック管理。
  - `PromptFactory.ts`: 翻訳方向に応じたプロンプト・ターゲット言語コード解決。
  - `adapters/`: `ModelAdapter.ts`, `plamoPrompt.ts`（モデル別フォーマット・出力クリーニング）。
  - `glossary/`: `GlossaryResolver.ts`, `TsvGlossaryPack.ts`（ユーザー辞書と TSV/ZIP 用語集パック）。
  - `wllama/`: `WllamaEngine.ts`（`PlamoLocalService` 直列実行・OPFS キャッシュフォールバック）。
- **Frontend Source**:
  - `App.tsx`: メイン画面の統括。
  - `hooks/`: `useServerStatus`, `useSpeechTranslation`, `useVAD`, `useMicrophone`, `usePlamoLocal`。
  - `components/`: `AppHeader`, `SettingsModal`, `LogViewer`, `GlossarySettings`, `OverlaySettingsComponents`, `settings/*Tabs`。
  - `utils/`: `audioUtils.ts`, `detectLanguage.ts`, `FileDownloader.ts`, `PathUtils.ts`, `RateLimitFallback.ts`, `cn.ts`。

### 4.2 ConfigManager (設定管理)

ユーザー設定は `config.json` に保存され、`src/types/config.ts` の `AppConfigSchema` で検証される。

- **whisper**: `provider` (`local`/`sensevoice`/`groq`/`openai`), `model`, `language`, `serverPort`, `apiKey`, `baseUrl`, `fallbackToSenseVoice` 等。
- **llm**: `provider` (`groq`/`openai`/`plamo-local`), `apiKey`, `model`, `baseUrl`, `groqModels`, `fallbackToPlamoLocal`。
- **translation**: `targetLang`, `streamingDisplay`。
- **vad / overlay / glossary / glossaryPacks / app**: VAD 閾値、オーバーレイポート・スタイル、用語集、既定マイク設定。

## 5. エラーハンドリングとログ

- **ログ出力**: `electron-log` を使用し、アプリケーションログをファイル (`logs/session_*.log`) およびコンソールに出力。
- **リカバリ**:
  - ASR サーバーや WebGPU 推論の初期化エラーは Main / Renderer 双方向で捕捉し、`AppHeader` バッジおよびログへ通知。
  - Groq API の HTTP 429 時は `RateLimitFallbackController` によりローカル代替モデルへシームレスに切り替え、一定時間後に自動復帰を再試行する。
