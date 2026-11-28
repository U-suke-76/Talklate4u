# Talklate4u

リアルタイム音声認識・翻訳 & OBS オーバーレイ表示アプリケーション。
ローカル ASR（Whisper OpenVINO/CUDA、SenseVoice-Small ONNX）およびクラウド ASR（Groq、OpenAI）と、オンデバイス WebGPU 翻訳（PLaMo 3 Translate）やクラウド LLM（Groq、OpenAI 互換 API）を組み合わせ、配信画面などに字幕を逐次表示できます。

## 🌟 主な機能

- **柔軟な音声認識 (ASR)**: ローカルの `whisper.cpp`（CPU / OpenVINO / CUDA）、**SenseVoice-Small（ローカル ONNX / `sherpa-onnx-node`）**、クラウド ASR（Groq / OpenAI）に対応。
- **マルチプロバイダー翻訳 (LLM)**: **Groq**、**OpenAI 互換 API**（OpenAI、Ollama、LM Studio、vLLM 等）、**PLaMo 3 Translate（ローカル WebGPU: `0.8B` / `2B`）** に対応。
- **レート制限自動フォールバック**: Groq で HTTP 429 が発生した際、ローカルモデルへ自動切り替え（`Groq Whisper → SenseVoice-Small`、`Groq LLM → PLaMo 3 Translate 0.8B`）。指数バックオフ（`60秒 → 120秒`）および 3 回連続時のセッション固定に対応。
- **ストリーミング字幕表示**: LLM の生成に合わせてメイン画面のログと OBS オーバーレイをリアルタイムに逐次更新。
- **多言語用語集 & TSV/ZIP パック**: 優先度付き用語登録および多言語 TSV/ZIP 用語集パックのインポートに対応。
- **OBS オーバーレイ**: 背景透過の字幕ウィンドウを OBS に重ねて表示し、スタイルやカスタム CSS も設定可能。

## 📦 インストールと使用方法 (一般ユーザー向け)

1. **インストール**
   配布されたインストーラー (`.exe`) を実行してインストールします。

2. **初期設定 (音声認識・翻訳・用語集設定)**
   画面右上の「Settings」ボタン、またはメニューバーの **File > Settings** から設定を行います。
   - **音声認識 (Whisper タブ)**
     - **ASR Provider**: `Local (whisper.cpp)`、`SenseVoice-Small (Local)`、`Groq API`、`OpenAI Compatible` から選択できます。
     - **SenseVoice-Small (Local)**: API キー不要でローカル ONNX 推論を実行します（初回起動時に INT8 モデルを自動ダウンロード）。
     - **Groq / OpenAI**: API Key の設定が必要です。Groq 利用時は **Rate Limit Fallback** を有効にすると、429 発生時にローカルの SenseVoice-Small へ自動フォールバックします。

   - **翻訳 (LLM タブ)**
     - **Groq (推奨)**
       - **API Key**: [Groq Cloud Console](https://console.groq.com/keys) で API Key を作成して入力します。
       - 高速かつ無料枠もあるためリアルタイム翻訳に最適です。リロードボタンで現在利用可能なモデル一覧を取得できます。
       - **Auto Fallback** を有効にすると、トークン制限（429）時にローカルの `PLaMo 3 Translate 0.8B` で翻訳を継続します。
     - **PLaMo 3 Translate (Local WebGPU)**
       - API キー不要・完全オンデバイス（WebGPU）で `plamo-3-translate-0.8b` または `plamo-3-translate-2b` を実行できます。
     - **OpenAI 互換 (OpenAI / Ollama / LM Studio / リモート vLLM)**
       - **OpenAI 利用時**: API Key に `sk-` から始まるキーを入力し、Base URL は空欄にします。
       - **Ollama / LM Studio / リモート vLLM 利用時**: Base URL にサーバーのアドレス（例: `http://localhost:11434/v1` や `http://localhost:1234/v1`）を入力し、認証不要の場合は API Key に任意の文字列を入力します。Google Colab 上で PLaMo 3 Translate 8B を立てる手順は [docs/colab/README.md](docs/colab/README.md) を参照してください。
     - **Streaming Display**: メイン画面および OBS オーバーレイでのリアルタイム逐次表示を切り替えます（Groq / OpenAI 互換 / PLaMo Local に対応）。

   - **用語集 (Glossary タブ)**
     - 翻訳方向・優先度付きの単語登録や、多言語 TSV/ZIP 用語集パックのインポートが行えます。

3. **文字起こしの開始**
   **General** タブでマイクを選択（またはデフォルトのまま）し、「Start Recording」ボタンを押すと文字起こしと翻訳が始まります。

4. **OBS への表示**
   OBS 側で「ブラウザソース」を追加し、URL に `http://localhost:9000` を指定すると、字幕が背景透過で表示されます。

### 📦 配布パッケージについて

配布パッケージ (インストーラー) には、**CPU版の Whisper サーバー** が同梱されています。
インストール後、すぐに音声認識を使用できますが、パッケージサイズ削減のため、以下のファイルは含まれていません：

- **OpenVINO ランタイム DLL**: Intel GPU/NPU で高速化したい場合は追加セットアップが必要です
- **OpenVINO 最適化モデル**: より高速な推論を行うためのモデルファイル

### 🚀 OpenVINOパフォーマンス最適化

**OpenVINO 最適化モデル** を使用することで、推論速度が向上します。

#### OpenVINOモデルの導入

1. **モデルのダウンロード**
   以下のリンクから、使用したいモデルの OpenVINO 版 (`.xml` と `.bin` のセット) をダウンロードしてください。
   - [Hugging Face: Intel/whisper.cpp-openvino-models](https://huggingface.co/Intel/whisper.cpp-openvino-models/tree/main)
   - _推奨_: `ggml-small-models.zip`

2. **モデルの配置**
   解凍して出てきたファイル (`.xml`, `.bin`) を、アプリのモデルフォルダにコピーします。
   - **保存場所**: `%APPDATA%\talklate4u\whisper-models`
     (エクスプローラーのアドレスバーに入力すると開けます)

3. **再起動**
   アプリを再起動すると、自動的に最適化モデルが読み込まれます。

#### OpenVINO DLL導入

Intel の内蔵 GPU や NPU を使用してさらに高速化したい場合は、**OpenVINO ランタイム DLL** の追加インストールが必要です。
詳細な手順は [docs/openvino.md](docs/openvino.md) を参照してください。

### 🏎️ NVIDIA GPU (CUDA版) の利用

NVIDIA製 GPU を搭載している場合、CUDA版の `whisper-server.exe` を使用することで OpenVINO 版以上の高速化が可能です。

1. **CUDA版サーバーの入手**
   [whisper.cpp のリリース](https://github.com/ggerganov/whisper.cpp/releases/latest) などから、Windows向けの CUDA (cuBLAS) ビルド済みバイナリ (`whisper-cublas-bin-x64.zip` 等) をダウンロードします。
   ※ 必要な DLL (`cublas64_11.dll`, `cudart64_110.dll` 等) が同梱されているか、あるいはシステムに CUDA Toolkit がインストールされていることを確認してください。

2. **ファイルの配置**
   ダウンロードしたファイル (`whisper-server.exe` と関連DLL) を適当なフォルダ（例: `C:\Tools\whisper-cuda`）に配置します。

3. **パスの設定**
   本アプリの設定画面 (Settings) を開き、**Whisper Server Path** 欄に配置した `whisper-server.exe` の絶対パスを入力して保存します。
   例: `C:\Tools\whisper-cuda\whisper-server.exe`

4. **設定の調整（必要な場合のみ）**
   一部のバージョンでは `Extra Arguments` に `-ngl 99` (GPUレイヤー数) の指定が必要です。
   ただし、 **起動時にエラーになる場合**（ヘルプに `-ngl` が無い場合）は、このオプションは **不要（空欄のままでOK）** です。
   ※ ログに `ggml_cuda_init: found ... CUDA devices` と出ていれば、オプション無しでもGPUが認識されています。

5. **確認**
   「Start」を押して文字起こしが動作すれば完了です。CUDAの使用状況はタスクマネージャー等で確認できます。

---

## 🛠️ 開発者向けガイド (Build Instructions)

このプロジェクトを開発・ビルドするための手順です。
特に `whisper-server.exe` のバイナリは npm パッケージに含まれていないため、手動でのビルドが必要です。

### 必須要件

- **Node.js**: v20 以上 (v22 以上推奨)
- **Visual Studio Build Tools 2022 (または 2026)**
  - ワークロード: "Desktop development with C++" (C++ によるデスクトップ開発)
- **OpenVINO Toolkit**: 2025.0 以降
  - _Note: Intel OpenVINO (GPU/NPU) を使用する場合は、追加のセットアップが必要です。詳細は [docs/openvino.md](docs/openvino.md) を参照してください。_
- **CMake**: 3.20 以上
- **Ninja**: ビルドシステム (推奨)

### 環境構築

```bash
# リポジトリのクローン
git clone <repository-url>
cd talklate4u

# 依存関係のインストール
npm install
```

### 🏗️ Whisper Server のビルド (重要)

本アプリのコアである `whisper-server.exe` を、OpenVINO 対応でビルドする手順です。

1. **開発者コマンドプロンプトの起動**
   Visual Studio の "Developer Command Prompt" (x64) を起動します。

2. **OpenVINO 環境変数の設定（オプション）**
   `setupvars.bat` を実行します。

   ```cmd
   "C:\Program Files (x86)\Intel\openvino_2025...\setupvars.bat"
   ```

3. **ビルドの実行**
   `whisper.cpp` ディレクトリに移動し、**Releaseモード** でビルドします。
   (Debugモードだとランタイムライブラリの不整合でクラッシュするため注意してください)

   ```cmd
   cd node_modules/nodejs-whisper/cpp/whisper.cpp

   rmdir /s /q build
   cmake -B build -G "Ninja" -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_SERVER=ON
   cmake --build build
   ```

OpenVINOを含む場合は"-DWHISPER_OPENVINO=1"を追加してください

4. **DLL の配置**
   ビルド成果物 (`build/bin`) に必要な DLL を集めます。これを行わないと実行時に `DllNotFound` エラーになります。

   ```cmd
   # 成果物ディレクトリへ移動
   cd build/bin

   # OpenVINO ランタイムとプラグインのコピー
   copy "C:\Program Files (x86)\Intel\openvino_...\runtime\bin\intel64\Release\*.dll" .

   # TBB (Threading Building Blocks) のコピー
   copy "C:\Program Files (x86)\Intel\openvino_...\runtime\3rdparty\tbb\bin\*.dll" .
   ```

5. **動作確認**
   ```cmd
   whisper-server.exe --help
   ```
   ヘルプが表示され、オプションに `--ov-e-device` 等が含まれていればビルド成功です。

### アプリケーションの起動 & パッケージング

**開発モード起動:**

```bash
npm start
```

`forge.config.ts` の設定により、開発モードでは `node_modules/.../build/bin` 内のバイナリが参照されます。

**パッケージ作成 (実行ファイルのみ):**

```bash
npm run package
```

インストーラーを作らず、`out/` フォルダに実行ファイル一式 (`.exe` と依存ファイル) を出力します。動作確認のテスト配布などに便利です。

**インストーラー作成 (配布用):**

```bash
npm run make
```

`package` の処理を行った後、さらにインストーラー (`setup.exe`) を作成します。
ビルド設定 (`forge.config.ts`) により、上記でビルドした `build/bin` フォルダ一式が同梱されます。

**テスト・Lint・品質チェック:**

```bash
# Vitest 単体テストの実行
npm run test:unit

# 型チェック / Lint / フォーマット
npx tsc --noEmit
npm run lint
npm run format

# 翻訳品質評価 CLI
npm run eval:translation -- --help
```

---

## 📄 ライセンス・クレジット (License & Acknowledgements)

### 🌟 AI モデル・謝辞 (Built with PLaMo)

- 本アプリのオンデバイス WebGPU 翻訳エンジンには、**株式会社Preferred Networks（PFN）**が開発・公開している翻訳特化モデルを採用しています。
  - **クレジット**: **Built with PLaMo**
  - **採用モデル**: `plamo-3-translate-0.8b` / `plamo-3-translate-2b`
  - **ライセンス**: 本モデルの利用は [PLaMoコミュニティライセンス契約 (PLaMo Community License)](https://plamo.preferredai.jp/info/plamo-community-license-ja) に準拠しています。
- オンデバイス WebGPU 推論ランタイムとして [Wllama](https://github.com/ngxson/wllama) を利用しています。
- 本アプリケーションのソースコードは MIT License のもとで公開されています。
