# 基本設計書 (Basic Design Document)

## 1. 概要
本ドキュメントは、リアルタイム翻訳・字幕システム「Talklate4u」の基本設計について記述する。
本システムは、配信者（ストリーマー）の声（日本語）をリアルタイムで認識・翻訳（韓国語等）し、OBS等の配信ソフト上に字幕としてオーバーレイ表示することを目的とする。

## 2. システムアーキテクチャ

### 2.1 全体構成
本アプリケーションは **Electron** フレームワークを採用し、以下の3つの主要コンポーネントで構成される。

1.  **Frontend (Renderer Process)**:
    *   ユーザーインターフェース (React + Tailwind CSS)。
    *   マイク音声の取得とVAD (Voice Activity Detection: 発話区間検出)。
    *   設定画面の提供。
2.  **Backend (Main Process & Internal Servers)**:
    *   **Main Process**: アプリケーションのライフサイクル管理、IPC通信のハブ。
    *   **MenuManager**: ネイティブアプリケーションメニュー（Settings, Edit, View等）の構築とイベントハンドリング。
    *   **Whisper Server**: 音声認識を行うローカルHTTPサーバー (C++製 `whisper.cpp` バイナリのラッパー)。
    *   **Overlay Server**: 字幕表示用のウェブページを配信するローカルHTTP/WebSocketサーバー。
3.  **External Services (LLM)**:
    *   翻訳を行う外部AIサービス (Groq, OpenAI等)。

```mermaid
graph TD
    subgraph "Renderer Process (Frontend)"
        UI[React UI]
        VAD[VAD (Voice Detection)]
        Audio[Microphone Input]
        Audio --> VAD
        VAD -->|WAV Buffer| IPC_Client[IPC Handler]
    end

    subgraph "Main Process (Backend)"
        IPC_Main[IPC Handler]
        Manager[Orchestrator (Main.ts)]
        Menu[Menu Manager]
        TS[Translation Service]
        WM[Whisper Manager]
        OM[Overlay Server]
        
        IPC_Client <-->|IPC| IPC_Main
        IPC_Main --> Manager
        Manager --> Menu
        Manager --> WM
        Manager --> TS
        
        WM -->|Spawn Process| WhisperBin[Whisper Server (C++)]
        WM -->|HTTP POST (Audio)| WhisperBin
        WhisperBin -->|JSON (Text)| WM
        
        TS -->|API Req| LLM[External LLM (Groq/OpenAI)]
        LLM -->|API Res| TS
        
        TS --> OM
    end

    subgraph "External / Output"
        Browser[Overlay Browser Source]
        LLM_API[Groq / OpenAI API]
        
        OM -->|Socket.IO| Browser
        LLM <--> LLM_API
    end
```

### 2.2 技術スタック
| コンポーネント | 技術要素 | 用途 |
| :--- | :--- | :--- |
| **Runtime** | Electron, Node.js | アプリケーション基盤 |
| **Frontend** | React, Vite, Tailwind CSS, DaisyUI | UI構築 |
| **Voice Detection** | @ricky0123/vad-web | ブラウザ上での高精度な発話検知 |
| **ASR (音声認識)** | nodejs-whisper (whisper.cpp) | ローカル高速音声認識サーバー |
| **Translation** | OpenAI SDK (Groq / OpenAI) | 多言語翻訳 (LLM利用) |
| **Overlay** | Express, Socket.IO | 字幕配信サーバー |

## 3. 機能設計

### 3.1 音声認識 (ASR) フロー
1.  **音声取得**: Rendererプロセスの `useVAD` フックにてマイク入力を監視。
2.  **発話検知**: 音声が閾値を超えた区間のみを切り出し、WAVフォーマット（16kHz, Mono, 16bit）に変換。
3.  **送信**: `ipcRenderer.invoke('transcribe-audio', buffer)` を通じてMainプロセスへ送信。
4.  **推論**: Mainプロセス内の `WhisperManager` が、ローカルで稼働中のWhisperサーバー (`whisper-server.exe`) へHTTP POSTリクエストを送信。
5.  **結果返却**: 認識されたテキストがMainプロセスを経由してRendererへ返される。

### 3.2 翻訳 (Translation) フロー
1.  **テキスト受信**: 音声認識結果のテキストに対し、`TranslationService.translate(text)` が呼び出される。
2.  **フィルタリング**: `NOISE_PATTERNS` に基づき、幻覚（Hallucination）や無意味な記号列を除外。
3.  **LLMリクエスト**: 設定されたプロバイダー（Groq または OpenAI）に対してAPIリクエストを送信。
    * 系统プロンプトにより、ゲーマー用語を含む自然な翻訳（日韓翻訳を想定）を指示。
    * **PromptFactory**: 言語ペア（Ja->Ko, Ja->En等）に基づき適切なシステムプロンプトを生成する Strategy パターンを実装。
4.  **結果処理**: 翻訳結果を以下の2方向へ通知する。
    *   **Frontend**: UI上のログ表示用。
    *   **Overlay Server**: 配信画面への字幕表示用。

### 3.3 オーバーレイ (Overlay)
*   **サーバー**: `OverlayServer` クラスが Express サーバーを起動し、`src/overlay/index.html` をホストする。
*   **通信**: Socket.IO を使用して、Mainプロセスから接続中のクライアント（OBSのブラウザソース等）へ翻訳結果をリアルタイム送信 (`broadcast`)。
*   **表示**: クライアント側（ブラウザ）で受信したテキストをCSSアニメーション付きで表示し、一定時間経過または画面外へ流れたら削除する。

## 4. モジュール詳細設計

### 4.1 ディレクトリ構成 (`src/`)
*   **`main.ts`**: アプリケーションのエントリーポイント。各マネージャーの初期化とIPCハンドリングを行う。
*   **`managers/`**:
    * `ConfigManager.ts`: `electron-store` を用いた設定ファイル (`config.json`) の読み書き。
    * `MenuManager.ts`: Electronネイティブメニューの構築と制御。
*   **`server/`**:
    *   `WhisperManager.ts`: Whisperバイナリのダウンロード、プロセス管理、推論リクエスト担当。
    *   `OverlayServer.ts`: Express + Socket.IO サーバーの実装。
*   **`services/`**:
    * `TranslationService.ts`: 翻訳ロジック、ノイズ除去、LLMクライアント管理。
    * `PromptFactory.ts`: 翻訳用システムプロンプトの生成ロジック。
*   **Frontend Source**:
    *   `App.tsx`: メインUIコンポーネント。ロジックはHooksに分離。
    *   `hooks/`: カスタムフック群
        (`useServerStatus`, `useSpeechTranslation`, `useVAD`, `useMicrophone`)。
    *   `components/`: UI部品 (`SettingsModal`, `LogViewer`, `GlossarySettings` 等)。
    *   `utils/`: ユーティリティ (`audioUtils.ts`: 音声処理共通関数)。

### 4.2 ConfigManager (設定管理)
ユーザー設定は `config.json` に保存される。
*   **whisper**: モデルパス、言語、ポート。
*   **llm**: プロバイダー種別、APIキー、モデル名、Base URL。
*   **overlay**: ポート番号。

### 4.3 TranslationService (翻訳サービス)
*   **責務**: テキストの翻訳と配信。
*   **幻覚対策**: 正規表現によるフィルタリングを行い、`[BLANK_AUDIO]` や記号のみの出力をLLMに渡さないよう制御する。
*   **システムプロンプト**: `system_prompt.txt` が存在すればそれを読み込み、なければデフォルトの「日韓ゲーマー翻訳」プロンプトを使用する。

## 5. エラーハンドリングとログ
*   **ログ出力**: `electron-log` を使用し、アプリケーションログをファイル (`logs/session_*.log`) およびコンソールに出力する。
*   **リカバリ**:
    *   WhisperサーバーやOBS接続のエラーはMainプロセスで捕捉し、Frontendへステータス通知を行う。
    *   APIレート制限エラー等は翻訳結果として `null` またはエラーメッセージを返し、UI側で適切に処理する（ログ削除等）。
