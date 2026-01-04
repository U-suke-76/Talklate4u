# Talklate4u

Real-time speech recognition & translation application with OBS overlay support.
Combines local Whisper (OpenVINO optimized) for fast transcription and LLMs (Groq, OpenAI, etc.) for high-accuracy translation, allowing you to display subtitles on your streaming screen.

## 🌟 Key Features

- **Real-time Transcription**: Fast and accurate speech recognition using Whisper.cpp.
- **Auto Translation**: Instant translation of recognized text using LLMs (Groq, OpenAI API).
- **OBS Overlay**: Display subtitles on OBS with a transparent background window.
- **OpenVINO Optimization**: High-speed inference utilizing Intel CPU/GPU.

## 📦 Installation and Usage (For General Users)

1. **Installation**
   Run the distributed installer (`.exe`) to install the application.

2. **Initial Setup (API Key Settings)**
   To use the translation feature, click the "Settings" button in the top right corner or go to **File > Settings** in the menu bar to configure the LLM (AI) settings.

   - **Groq (Recommended)**
     - **API Key**: Access the [Groq Cloud Console](https://console.groq.com/keys) to create an API Key and enter it.
     - It is fast and currently offers a generous free tier, making it ideal for real-time translation.
     - Use the reload button to fetch the list of models currently available on Groq.

   - **OpenAI API / Local LLM**
     - **Provider**: Select `OpenAI Compatible`.
     - **Using OpenAI**: Enter your key starting with `sk-` in the API Key field. Leave the Base URL blank.
     - **Using Ollama / LM Studio**:
       - Enter your local server address in the Base URL (e.g., `http://localhost:11434/v1` or `http://localhost:1234/v1`).
       - Enter any string (e.g., `ollama`) in the API Key field.

3. **Start Transcription**
   Select your microphone and press the "Start" button to begin transcription and translation.

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
   - *Recommended*: `ggml-small-models.zip`

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
   *Note: Ensure that the necessary DLLs (`cublas64_11.dll`, `cudart64_110.dll`, etc.) are included or that the CUDA Toolkit is installed on your system.*

2. **Place Files**
   Place the downloaded files (`whisper-server.exe` and related DLLs) in a suitable folder (e.g., `C:\Tools\whisper-cuda`).

3. **Configure Path**
   Open the settings screen (Settings) in this app, enter the absolute path of the placed `whisper-server.exe` in the **Whisper Server Path** field, and save.
   Example: `C:\Tools\whisper-cuda\whisper-server.exe`

4. **Adjust Settings (Only if necessary)**
   Some versions may require specifying `-ngl 99` (number of GPU layers) in `Extra Arguments`.
   However, if you encounter an **error at startup** (if `-ngl` is not in the help), this option is **not required (leave blank)**.
   *Note: If the log shows `ggml_cuda_init: found ... CUDA devices`, the GPU is recognized even without options.*

5. **Verify**
   Press "Start" and if transcription works, you are all set. You can check CUDA usage in Task Manager.

---

## 🛠️ Developer Guide (Build Instructions)

Instructions for developing and building this project.
Note that the `whisper-server.exe` binary is not included in the npm package and must be built manually.

### Prerequisites

- **Node.js**: v18 or later
- **Visual Studio Build Tools 2022 (or 2026)**
  - Workload: "Desktop development with C++"
- **OpenVINO Toolkit**: 2025.0 or later
  - *Note: For Intel OpenVINO (GPU/NPU) support, additional setup is required. See [docs/openvino.md](docs/openvino.md) for details.*
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
