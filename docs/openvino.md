# OpenVINO バックエンドのセットアップ

デフォルトのパッケージサイズを削減するため、Intel OpenVINO™ に関連するファイルはインストーラーに含まれていません。
Intel GPU / NPU を使用して音声認識を高速化したい場合は、以下の手順で手動セットアップを行ってください。

## 必要なファイル

以下のファイル（約 90MB〜）が必要です。

- `openvino.dll`
- `openvino_intel_cpu_plugin.dll`
- `openvino_intel_gpu_plugin.dll`
- `openvino_intel_npu_plugin.dll`
- `openvino_auto_batch_plugin.dll`
- `openvino_auto_plugin.dll`
- `openvino_hetero_plugin.dll`
- `openvino_ir_frontend.dll`
- `openvino_onnx_frontend.dll`
- `openvino_paddle_frontend.dll`
- `openvino_pytorch_frontend.dll`
- `openvino_tensorflow_frontend.dll`
- `openvino_tensorflow_lite_frontend.dll`
- `tbb12.dll`

## 入手方法

### 方法 A: ソースコードからコピー

もしあなたがこのアプリケーションを自分でビルドできる環境を持っているなら、以下のパスにこれらのファイルが存在します。
`node_modules/nodejs-whisper/cpp/whisper.cpp/build/bin/`

### 方法 B: Intel 公式から入手

Intel Distribution of OpenVINO Toolkit の公式サイトから、対応するバージョンのランタイムライブラリをダウンロードしてください。
(※ Whisper.cpp と互換性のあるバージョンを選択する必要があります)

## 配置場所

これらの DLL ファイルを、アプリケーションの実行ファイル（`Talklate4u.exe`）と同じディレクトリ、または `resources` フォルダ直下に配置してください。
正しく配置されると、設定画面で OpenVINO バックエンドが有効化された際に自動的に読み込まれます。
