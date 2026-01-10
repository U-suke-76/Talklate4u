# Talklate4u

실시간 음성 인식・번역 & OBS 오버레이 표시 애플리케이션.
로컬에서 작동하는 Whisper (OpenVINO 최적화)를 통한 빠른 받아쓰기와, LLM (Groq, OpenAI 등)을 이용한 고정밀 번역을 결합하여, 방송 화면 등에 자막을 표시할 수 있습니다.

## 🌟 주요 기능

- **실시간 받아쓰기**: Whisper.cpp를 사용한 고속・고정밀 음성 인식.
- **자동 번역**: 인식된 텍스트를 LLM (Groq, OpenAI API)으로 즉시 번역.
- **OBS 오버레이**: 배경 투명 자막 창을 OBS에 겹쳐서 표시 가능.
- **OpenVINO 최적화**: Intel CPU/GPU를 활용한 고속 추론.

## 📦 설치 및 사용 방법 (일반 사용자용)

1. **설치**
   배포된 설치 파일 (`.exe`)을 실행하여 설치합니다.

2. **초기 설정 (음성 인식 및 번역 설정)**
   번역 기능을 이용하려면, 화면 우측 상단의 「Settings」 버튼, 또는 메뉴바의 **File > Settings** 에서 설정을 수행합니다.

   - **음성 인식 (Whisper)**
     - **Provider**: `Local` (기본값), `Groq`, `OpenAI` 중에서 선택할 수 있습니다.
     - **Groq/OpenAI**: API Key 설정이 필요합니다. 클라우드 ASR을 사용하면 PC에 부담을 주지 않고 `large-v3-turbo` 모델을 통한 고정밀 인식이 가능합니다.

   - **번역 (LLM)**
     - **Groq (권장)**
       - **API Key**: [Groq Cloud Console](https://console.groq.com/keys) 에 접속하여 API Key를 생성하고 입력해 주세요.
       - 빠르고 현재 무료 사용량이 넉넉하여 실시간 번역에 최적입니다.
       - 모델 리로드 버튼으로, 현재 Groq에서 제공되는 모델 목록을 가져올 수 있습니다.

     - **OpenAI API / 로컬 LLM**
       - **Provider**: `OpenAI Compatible` 을 선택합니다.
       - **OpenAI 사용 시**: API Key에 `sk-` 로 시작하는 키를 입력합니다. Base URL은 비워두셔도 됩니다.
       - **Ollama / LM Studio 사용 시**:
         - Base URL에 로컬 서버 주소 (예: `http://localhost:11434/v1` 또는 `http://localhost:1234/v1`) 를 입력합니다.
         - API Key에는 `ollama` 등 임의의 문자열을 입력해 주세요.

3. **받아쓰기 시작**
   마이크를 선택하고 「Start」 버튼을 누르면 받아쓰기 및 번역이 시작됩니다.

4. **OBS 표시**
   OBS에서 「브라우저 소스 (Browser)」를 추가하고, URL에 `http://localhost:9000` 을 지정하면 자막이 배경 투명으로 표시됩니다.

### 📦 배포 패키지에 대하여

배포 패키지 (인스톨러) 에는 **CPU 버전의 Whisper 서버**가 포함되어 있습니다.
설치 후 즉시 음성 인식을 사용할 수 있지만, 패키지 크기 절감을 위해 다음 파일은 포함되어 있지 않습니다:

- **OpenVINO 런타임 DLL**: Intel GPU/NPU 로 고속화하려면 추가 설정이 필요합니다
- **OpenVINO 최적화 모델**: 더 빠른 추론을 위한 모델 파일

### 🚀 OpenVINO 성능 최적화

**OpenVINO 최적화 모델**을 사용하면 추론 속도가 향상됩니다.

#### OpenVINO 모델 도입

1. **모델 다운로드**
   아래 링크에서, 사용하고 싶은 모델의 OpenVINO 버전 (`.xml` 과 `.bin` 세트) 을 다운로드해 주세요.
   - [Hugging Face: Intel/whisper.cpp-openvino-models](https://huggingface.co/Intel/whisper.cpp-openvino-models/tree/main)
   - *권장*: `ggml-small-models.zip`

2. **모델 배치**
   압축을 풀고 나온 파일 (`.xml`, `.bin`) 을 앱의 모델 폴더에 복사합니다.
   - **저장 위치**: `%APPDATA%\talklate4u\whisper-models`
     (탐색기 주소창에 입력하면 열립니다)

3. **재시작**
   앱을 재시작하면, 자동으로 최적화 모델이 로드됩니다.

#### OpenVINO DLL 도입

Intel 내장 GPU 나 NPU 를 사용하여 더 고속화하려면, **OpenVINO 런타임 DLL**의 추가 설치가 필요합니다.
자세한 절차는 [docs/openvino.md](docs/openvino.md) 를 참조하세요.

### 🏎️ NVIDIA GPU (CUDA 버전) 사용

NVIDIA GPU를 탑재하고 있는 경우, CUDA 버전의 `whisper-server.exe` 를 사용하여 OpenVINO 버전 이상의 고속화가 가능합니다.

1. **CUDA 버전 서버 입수**
   [whisper.cpp 릴리스](https://github.com/ggerganov/whisper.cpp/releases/latest) 등에서, Windows용 CUDA (cuBLAS) 빌드된 바이너리 (`whisper-cublas-bin-x64.zip` 등) 를 다운로드합니다.
   ※ 필요한 DLL (`cublas64_11.dll`, `cudart64_110.dll` 등) 이 동봉되어 있거나, 시스템에 CUDA Toolkit이 설치되어 있는지 확인해 주세요.

2. **파일 배치**
   다운로드한 파일 (`whisper-server.exe` 및 관련 DLL) 을 적당한 폴더 (예: `C:\Tools\whisper-cuda`) 에 배치합니다.

3. **경로 설정**
   본 앱의 설정 화면 (Settings) 을 열고, **Whisper Server Path** 란에 배치한 `whisper-server.exe` 의 절대 경로를 입력하고 저장합니다.
   예: `C:\Tools\whisper-cuda\whisper-server.exe`

4. **설정 조정 (필요한 경우에만)**
   일부 버전에서는 `Extra Arguments` 에 `-ngl 99` (GPU 레이어 수) 지정이 필요합니다.
   단, **시동 시 에러가 발생하는 경우** (헬프에 `-ngl` 이 없는 경우), 이 옵션은 **불필요 (빈칸으로 OK)** 합니다.
   ※ 로그에 `ggml_cuda_init: found ... CUDA devices` 라고 나오면, 옵션 없이도 GPU가 인식되고 있는 것입니다.

5. **확인**
   「Start」를 눌러 받아쓰기가 작동하면 완료입니다. CUDA 사용 현황은 작업 관리자 등에서 확인할 수 있습니다.

---

## 🛠️ 개발자 가이드 (Build Instructions)

이 프로젝트를 개발・빌드하기 위한 절차입니다.
특히 `whisper-server.exe` 바이너리는 npm 패키지에 포함되어 있지 않으므로, 수동 빌드가 필요합니다.

### 필수 요건

- **Node.js**: v18 이상
- **Visual Studio Build Tools 2022 (또는 2026)**
  - 워크로드: "Desktop development with C++" (C++를 사용한 데스크톱 개발)
- **OpenVINO Toolkit**: 2025.0 이후
  - *참고: Intel OpenVINO (GPU/NPU) 를 사용하는 경우, 추가 설정이 필요합니다. 자세한 내용은 [docs/openvino.md](docs/openvino.md) 를 참조하세요.*
- **CMake**: 3.20 이상
- **Ninja**: 빌드 시스템 (권장)

### 환경 구축

```bash
# 리포지토리 클론
git clone <repository-url>
cd talklate4u

# 의존성 설치
npm install
```

### 🏗️ Whisper Server 빌드 (중요)

본 앱의 핵심인 `whisper-server.exe` 를 OpenVINO 대응으로 빌드하는 절차입니다.

1. **개발자 명령 프롬프트 실행**
   Visual Studio의 "Developer Command Prompt" (x64) 를 실행합니다.

2. **OpenVINO 환경 변수 설정 (옵션)**
   `setupvars.bat` 를 실행합니다.
   ```cmd
   "C:\Program Files (x86)\Intel\openvino_2025...\setupvars.bat"
   ```

3. **빌드 실행**
   `whisper.cpp` 디렉토리로 이동하여 **Release 모드**로 빌드합니다.
   (Debug 모드에서는 런타임 라이브러리 불일치로 충돌할 수 있으니 주의하세요)

   ```cmd
   cd node_modules/nodejs-whisper/cpp/whisper.cpp
   
   rmdir /s /q build
   cmake -B build -G "Ninja" -DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl -DCMAKE_BUILD_TYPE=Release -DWHISPER_BUILD_SERVER=ON
   cmake --build build
   ```

   OpenVINO를 포함하려면 cmake 명령에 `-DWHISPER_OPENVINO=1`을 추가하세요.

4. **DLL 배치**
   빌드 결과물 (`build/bin`) 에 필요한 DLL을 모읍니다. 이를 수행하지 않으면 실행 시 `DllNotFound` 에러가 발생합니다.
   
   ```cmd
   # 결과물 디렉토리로 이동
   cd build/bin
   
   # OpenVINO 런타임 및 플러그인 복사
   copy "C:\Program Files (x86)\Intel\openvino_...\runtime\bin\intel64\Release\*.dll" .
   
   # TBB (Threading Building Blocks) 복사
   copy "C:\Program Files (x86)\Intel\openvino_...\runtime\3rdparty\tbb\bin\*.dll" .
   ```

5. **동작 확인**
   ```cmd
   whisper-server.exe --help
   ```
   도움말이 표시되고, 옵션에 `--ov-e-device` 등이 포함되어 있다면 빌드 성공입니다.

### 애플리케이션 실행 & 패키징

**개발 모드 실행:**

```bash
npm start
```

`forge.config.ts` 설정에 따라, 개발 모드에서는 `node_modules/.../build/bin` 내의 바이너리가 참조됩니다.

**패키지 생성 (실행 파일만):**

```bash
npm run package
```

인스톨러를 만들지 않고, `out/` 폴더에 실행 파일 일체 (`.exe` 와 의존 파일) 를 출력합니다. 동작 확인용 테스트 배포 등에 유용합니다.

**인스톨러 생성 (배포용):**

```bash
npm run make
```

`package` 처리를 수행한 후, 추가로 인스톨러 (`setup.exe`) 를 생성합니다.
빌드 설정 (`forge.config.ts`) 에 의해, 위에서 빌드한 `build/bin` 폴더 일체가 동봉됩니다.
