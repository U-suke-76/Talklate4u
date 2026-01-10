# Talklate4u

リアルタイム音声認識・翻訳 & OBSオーバーレイ表示アプリケーション。
ローカルで動作する Whisper (OpenVINO最適化) による高速な文字起こしと、LLM (Groq, OpenAI等) による高精度な翻訳を組み合わせ、配信画面などに字幕を表示できます。

## 🌟 主な機能

- **リアルタイム文字起こし**: Whisper.cpp を使用した高速・高精度な音声認識。
- **自動翻訳**: 認識したテキストを LLM (Groq, OpenAI API) で即座に翻訳。
- **OBS オーバーレイ**: 背景透過の字幕ウィンドウを OBS に重ねて表示可能。
- **OpenVINO 最適化**: Intel CPU/GPU を活用した高速推論。

## 📦 インストールと使用方法 (一般ユーザー向け)

1. **インストール**
   配布されたインストーラー (`.exe`) を実行してインストールします。

2. **初期設定 (音声認識・翻訳設定)**
   翻訳機能を利用するには、画面右上の「Settings」ボタン、またはメニューバーの **File > Settings** から設定を行います。

   - **音声認識 (Whisper)**
     - **Provider**: `Local` (デフォルト)、`Groq`、`OpenAI` から選択できます。
     - **Groq/OpenAI**: API Keyの設定が必要です。クラウドASRを使用することで、PCに負荷をかけずに `large-v3-turbo` モデルによる高精度な認識が可能です。

   - **翻訳 (LLM)**
     - **Groq (推奨)**
       - **API Key**: [Groq Cloud Console](https://console.groq.com/keys) にアクセスして API Key を作成し、入力してください。
       - 高速かつ現在は無料枠も大きいため、リアルタイム翻訳に最適です。
       - モデルのリロードボタンで、現在Groqで提供されているモデルを取得できます。

     - **OpenAI API / ローカルLLM**
       - **Provider**: `OpenAI Compatible` を選択します。
       - **OpenAI 利用時**: API Key に `sk-` から始まるキーを入力します。Base URL は空欄で OK です。
       - **Ollama / LM Studio 利用時**:
         - Base URL にローカルサーバーのアドレス (例: `http://localhost:11434/v1` や `http://localhost:1234/v1`) を入力します。
         - API Key には `ollama` など任意の文字列を入力してください。

3. **文字起こしの開始**
   マイクを選択して「Start」ボタンを押すと、文字起こしと翻訳が始まります。

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
   - *推奨*: `ggml-small-models.zip`

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

- **Node.js**: v18以上
- **Visual Studio Build Tools 2022 (または 2026)**
  - ワークロード: "Desktop development with C++" (C++ によるデスクトップ開発)
- **OpenVINO Toolkit**: 2025.0 以降
  - *Note: Intel OpenVINO (GPU/NPU) を使用する場合は、追加のセットアップが必要です。詳細は [docs/openvino.md](docs/openvino.md) を参照してください。*
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
