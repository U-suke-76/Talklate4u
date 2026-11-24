#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION="${COLAB_SESSION:-plamo-server}"
GPU_TYPE="${COLAB_GPU:-T4}"
LOCAL_PORT="${LOCAL_PORT:-8000}"
REMOTE_PORT=8000
USE_DRIVE_CACHE="${USE_DRIVE_CACHE:-0}"
DEFAULT_MODEL_ID="pfnet/plamo-3-translate-8b"
if [ "$GPU_TYPE" = "T4" ]; then
  DEFAULT_MODEL_ID="pfnet/plamo-3-translate-8b-W4A16"
fi
MODEL_ID="${PLAMO_MODEL_ID:-$DEFAULT_MODEL_ID}"
SERVED_NAME="${PLAMO_SERVED_NAME:-plamo-3-translate-8b}"
MAX_MODEL_LEN="${PLAMO_MAX_MODEL_LEN:-4096}"

_CLEANED_UP=0

# 終了時（Ctrl+C やエラー時）に必ずランタイムを破棄し、停止を確認する
cleanup() {
  if [ "$_CLEANED_UP" -eq 1 ]; then
    return
  fi
  _CLEANED_UP=1
  # 終了処理と停止確認中に Ctrl+C を連打されても中断されないよう保護する
  trap '' INT TERM

  echo ""
  echo "[CLEANUP] Terminating Colab session '$SESSION' to save compute units..."
  colab stop -s "$SESSION" || true

  local stopped=0
  for _ in 1 2 3 4 5; do
    if ! colab sessions 2>/dev/null | grep -qE "(^|[[:space:]])${SESSION}([[:space:]]|$)"; then
      stopped=1
      break
    fi
    sleep 1
  done

  if [ "$stopped" -eq 1 ]; then
    echo "[CLEANUP] Verified: session '$SESSION' is stopped."
  else
    echo "[WARN] Session '$SESSION' may still be active. Current sessions:"
    colab sessions || true
    echo "[WARN] Please run manually if needed: colab stop -s $SESSION"
  fi
}
trap cleanup EXIT

echo "=== Talklate4u PLaMo 3 Translate Server (Colab CLI) ==="
echo "Session: $SESSION | GPU: $GPU_TYPE | Local URL: http://127.0.0.1:${LOCAL_PORT}/v1"

echo "[1/5] Provisioning Colab GPU runtime ($GPU_TYPE)..."
colab new -s "$SESSION" --gpu "$GPU_TYPE"

if [ "$USE_DRIVE_CACHE" = "1" ]; then
  echo "[2/5] Mounting Google Drive for Hugging Face cache..."
  colab drivemount -s "$SESSION" || echo "[WARN] Drive mount skipped or failed; continuing without cache."
else
  echo "[2/5] Skipping Google Drive mount (USE_DRIVE_CACHE=0)."
fi

echo "[3/5] Installing vLLM (>=0.12.0) on Colab..."
colab install -s "$SESSION" "vllm>=0.12.0"

echo "[4/5] Uploading server script (/content/serve_plamo.py)..."
colab upload -s "$SESSION" "${SCRIPT_DIR}/serve_plamo.py" /content/serve_plamo.py

echo "[5/5] Starting vLLM server and opening SSH tunnel (127.0.0.1:${LOCAL_PORT} -> Colab:${REMOTE_PORT})..."
echo "------------------------------------------------------------------"
echo "Talklate4u Settings:"
echo "  Provider : openai"
echo "  Model    : plamo-3-translate-8b"
echo "  Base URL : http://127.0.0.1:${LOCAL_PORT}/v1"
echo "  API Key  : dummy"
echo "------------------------------------------------------------------"
echo "Streaming /content/vllm.log ... (Wait for 'Application startup complete.')"
echo "Press Ctrl+C to stop the server and terminate the Colab runtime."
echo ""

# ProxyCommand + OpenSSH でポートフォワードを張りつつ、vLLM をフォアグラウンド起動してログを直接表示
ssh \
  -o "ProxyCommand=colab ssh --proxy-mode -s ${SESSION}" \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  -o ExitOnForwardFailure=yes \
  -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
  root@colab-runtime \
  "PLAMO_MODEL_ID='${MODEL_ID}' PLAMO_SERVED_NAME='${SERVED_NAME}' PLAMO_MAX_MODEL_LEN='${MAX_MODEL_LEN}' PLAMO_PORT='${REMOTE_PORT}' python3 -u /content/serve_plamo.py 2>&1 | tee /content/vllm.log" || true
