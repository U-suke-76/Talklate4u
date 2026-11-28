# Talklate4u

Real-time speech recognition & translation application with OBS overlay support.
Combines local ASR (Whisper OpenVINO/CUDA or SenseVoice-Small ONNX) and cloud ASR (Groq, OpenAI) with local WebGPU translation (PLaMo 3 Translate) and cloud LLMs (Groq, OpenAI-compatible APIs), allowing you to display streaming subtitles on your streaming screen.

## 🌟 Key Features

- **Flexible Speech Recognition (ASR)**: Supports local `whisper.cpp` (CPU / OpenVINO / CUDA), **SenseVoice-Small (Local ONNX via `sherpa-onnx-node`)**, and Cloud ASR (Groq / OpenAI).
- **Multi-Provider Translation (LLM)**: Supports **Groq**, **OpenAI Compatible** (OpenAI, Ollama, LM Studio, vLLM, etc.), and **PLaMo 3 Translate (Local WebGPU: `0.8B` / `2B`)**.
- **Automatic Rate-Limit Fallback**: When Groq hits HTTP 429, automatically falls back to local models (`Groq Whisper -> SenseVoice-Small`, `Groq LLM -> PLaMo 3 Translate 0.8B`) with exponential backoff (`60s -> 120s`) and session lock after 3 consecutive 429s.
- **Streaming Subtitle Display**: Real-time progressive translation output on both the main log view and the OBS overlay.
- **Multilingual Glossary & TSV/ZIP Packs**: Register custom term pairs with priority ordering, or import multilingual TSV/ZIP glossary packs.
- **OBS Overlay**: Display subtitles on OBS with a transparent background window and customizable styles / custom CSS.

## 📦 Installation and Usage (For General Users)

1. **Installation**
   Run the distributed installer (`.exe`) to install the application.

2. **Initial Setup (ASR, Translation & Glossary Settings)**
   Click the "Settings" button in the top right corner or go to **File > Settings** in the menu bar.
   - **Speech Recognition (Whisper tab)**
     - **ASR Provider**: Choose from `Local (whisper.cpp)`, `SenseVoice-Small (Local)`, `Groq API`, or `OpenAI Compatible`.
     - **SenseVoice-Small (Local)**: Runs locally via ONNX without requiring an API Key (auto-downloads the INT8 model on first start).
     - **Groq / OpenAI**: Requires an API Key. Groq supports `Rate Limit Fallback`, which automatically switches to local SenseVoice-Small on HTTP 429 and retries Groq after cooldown.

   - **Translation (LLM tab)**
     - **Groq (Recommended)**
       - **API Key**: Access the [Groq Cloud Console](https://console.groq.com/keys) to create an API Key and enter it.
       - Fast inference with a free tier, ideal for real-time translation. Use the reload button to fetch available models.
       - Enable **Auto Fallback** to continue translating locally with `PLaMo 3 Translate 0.8B` when Groq hits rate limits (429).
     - **PLaMo 3 Translate (Local WebGPU)**
       - Runs on-device translation via WebGPU (`plamo-3-translate-0.8b` or `plamo-3-translate-2b`) with no API key required.
     - **OpenAI Compatible (OpenAI / Ollama / LM Studio / Remote vLLM)**
       - **Using OpenAI**: Enter your key starting with `sk-` in API Key and leave Base URL blank.
       - **Using Ollama / LM Studio / Remote vLLM**: Enter the server endpoint in Base URL (e.g., `http://localhost:11434/v1` or `http://localhost:1234/v1`) and any non-empty string in API Key if no auth is required. For running PLaMo 3 Translate 8B on Google Colab, see [docs/colab/README.md](docs/colab/README.md).
     - **Streaming Display**: Toggle real-time progressive text display on the main screen and OBS overlay (supported across Groq, OpenAI Compatible, and PLaMo Local).

   - **Glossary (Glossary tab)**
     - Add custom word/phrase pairs with language direction and priority, or import multilingual TSV/ZIP glossary packs.

3. **Start Transcription**
   Select your microphone in **General** settings (or use default) and press **Start Recording** to begin transcription and translation.

4. **Displaying in OBS**
   Add a "Browser" source in OBS and set the URL to `http://localhost:9000`. The subtitles will appear with a transparent background.

### 📦 About the Distribution Package

The distribution package (installer) includes **CPU version of the Whisper server**.
You can use speech recognition immediately after installation. To reduce package size, the following files are NOT included:

- **OpenVINO Runtime DLLs**: Additional setup required for Intel GPU/NPU acceleration
- **OpenVINO Optimized Models**: Model files for faster inference

### 🚀 OpenVINO Performance Optimization

Using **OpenVINO optimized models** can improve inference speed.

#### Installing OpenVINO Models

1. **Download Model**
   Download the OpenVINO version (`.xml` and `.bin` set) of the model you wish to use from the link below.
   - [Hugging Face: Intel/whisper.cpp-openvino-models](https://huggingface.co/Intel/whisper.cpp-openvino-models/tree/main)
   - _Recommended_: `ggml-small-models.zip`

2. **Place Model**
   Extract the files (`.xml`, `.bin`) and copy them to the app's model folder.
   - **Location**: `%APPDATA%\talklate4u\whisper-models`
     (You can open this path by entering it in the File Explorer address bar)

3. **Restart**
   Restart the app, and the optimized model will be loaded automatically.

#### Installing OpenVINO DLLs

If you want to accelerate further using Intel integrated GPU or NPU, **OpenVINO runtime DLLs** must be installed manually.
See [docs/openvino.md](docs/openvino.md) for detailed instructions.

### 🏎️ Using NVIDIA GPU (CUDA Version)

If you have an NVIDIA GPU, you can use the CUDA version of `whisper-server.exe` for even faster performance than the OpenVINO version.

1. **Get CUDA Server**
   Download the Windows CUDA (cuBLAS) pre-built binary (`whisper-cublas-bin-x64.zip`, etc.) from the [whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases/latest).
   _Note: Ensure that the necessary DLLs (`cublas64_11.dll`, `cudart64_110.dll`, etc.) are included or that the CUDA Toolkit is installed on your system._

2. **Place Files**
   Place the downloaded files (`whisper-server.exe` and related DLLs) in a suitable folder (e.g., `C:\Tools\whisper-cuda`).

3. **Configure Path**
   Open the settings screen (Settings) in this app, enter the absolute path of the placed `whisper-server.exe` in the **Whisper Server Path** field, and save.
   Example: `C:\Tools\whisper-cuda\whisper-server.exe`

4. **Adjust Settings (Only if necessary)**
   Some versions may require specifying `-ngl 99` (number of GPU layers) in `Extra Arguments`.
   However, if you encounter an **error at startup** (if `-ngl` is not in the help), this option is **not required (leave blank)**.
   _Note: If the log shows `ggml_cuda_init: found ... CUDA devices`, the GPU is recognized even without options._

5. **Verify**
   Press "Start" and if transcription works, you are all set. You can check CUDA usage in Task Manager.

---

## 🛠️ Developer Guide (Build Instructions)

Instructions for developing and building this project.
Note that the `whisper-server.exe` binary is not included in the npm package and must be built manually.

### Prerequisites

- **Node.js**: v20 or later (v22+ recommended)
- **Visual Studio Build Tools 2022 (or 2026)**
  - Workload: "Desktop development with C++"
- **OpenVINO Toolkit**: 2025.0 or later
  - _Note: For Intel OpenVINO (GPU/NPU) support, additional setup is required. See [docs/openvino.md](docs/openvino.md) for details._
- **CMake**: 3.20 or later
- **Ninja**: Build system (Recommended)

### Environment Setup

```bash
# Clone repository
git clone <repository-url>
cd talklate4u

# Install dependencies
npm install
```

### 🏗️ Building Whisper Server (Important)

Steps to build `whisper-server.exe`, the core of this app, with OpenVINO support.

1. **Launch Developer Command Prompt**
   Open "Developer Command Prompt" (x64) for Visual Studio.

2. **Set OpenVINO Environment Variables (Optional)**
   Run `setupvars.bat`.

   ```cmd
   "C:\Program Files (x86)\Intel\openvino_2025...\setupvars.bat"
   ```

3. **Run Build**
   Navigate to the `whisper.cpp` directory and build in **Release mode**.
   (Note: Debug mode may crash due to runtime library mismatches)

   ```cmd
   cd node_modules/nodejs-whisper/cpp/whisper.cpp

   rmdir /s /q build
   cmake -B build -G "Ninja" -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_SERVER=ON
   cmake --build build
   ```

   To include OpenVINO support, add `-DWHISPER_OPENVINO=1` to the cmake command.

4. **Place DLLs**
   Collect the necessary DLLs into the build output (`build/bin`). Without this, a `DllNotFound` error will occur at runtime.

   ```cmd
   # Navigate to output directory
   cd build/bin

   # Copy OpenVINO runtime and plugins
   copy "C:\Program Files (x86)\Intel\openvino_...\runtime\bin\intel64\Release\*.dll" .

   # Copy TBB (Threading Building Blocks)
   copy "C:\Program Files (x86)\Intel\openvino_...\runtime\3rdparty\tbb\bin\*.dll" .
   ```

5. **Verify Operation**
   ```cmd
   whisper-server.exe --help
   ```
   If the help is displayed and options like `--ov-e-device` are included, the build is successful.

### Running & Packaging the Application

**Run in Development Mode:**

```bash
npm start
```

Depending on `forge.config.ts`, development mode will reference the binary in `node_modules/.../build/bin`.

**Create Package (Executable only):**

```bash
npm run package
```

Creates a set of executable files (`.exe` and dependencies) in the `out/` folder without creating an installer. Useful for testing and distribution.

**Create Installer (For Distribution):**

```bash
npm run make
```

After performing `package`, creates an installer (`setup.exe`).
The build settings (`forge.config.ts`) ensure the `build/bin` folder built above is included.

**Testing, Linting & Quality Checks:**

```bash
# Run Vitest unit tests
npm run test:unit

# Type check, lint, and format
npx tsc --noEmit
npm run lint
npm run format

# Evaluate translation quality against transcripts
npm run eval:translation -- --help
```

---

## 📄 License & Acknowledgements

### 🌟 AI Models & Attribution (Built with PLaMo)

- The local WebGPU translation engine integrates translation-specialized models developed and published by **Preferred Networks, Inc. (PFN)**:
  - **Attribution**: **Built with PLaMo**
  - **Models**: `plamo-3-translate-0.8b` / `plamo-3-translate-2b`
  - **License**: Usage of these models is subject to the [PLaMo Community License](https://plamo.preferredai.jp/info/plamo-community-license-en) ([Japanese](https://plamo.preferredai.jp/info/plamo-community-license-ja)).
- On-device WebGPU inference runtime is powered by [Wllama](https://github.com/ngxson/wllama).
- The source code of this application is released under the MIT License.
