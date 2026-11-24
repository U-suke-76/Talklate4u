import os
import subprocess
import sys

# Google Drive がマウントされていればモデルキャッシュ先として利用する（2回目以降の起動短縮）
DRIVE_CACHE_DIR = '/content/drive/MyDrive/huggingface_cache'
if os.path.isdir('/content/drive/MyDrive'):
  os.makedirs(DRIVE_CACHE_DIR, exist_ok=True)
  os.environ['HF_HOME'] = DRIVE_CACHE_DIR
  print(f'[INFO] Using Google Drive cache: {DRIVE_CACHE_DIR}', flush=True)
else:
  print('[INFO] Google Drive not mounted. Using ephemeral local cache.', flush=True)

# GPU を判定し、T4 の場合は float16 + W4A16（未指定時）にフォールバックする
try:
  gpu_name = (
    subprocess.check_output(
      ['nvidia-smi', '--query-gpu=name', '--format=csv,noheader'],
      stderr=subprocess.DEVNULL,
    )
    .decode()
    .strip()
  )
except Exception:
  gpu_name = 'unknown'

is_t4 = 'T4' in gpu_name
default_model_id = 'pfnet/plamo-3-translate-8b-W4A16' if is_t4 else 'pfnet/plamo-3-translate-8b'
MODEL_ID = os.environ.get('PLAMO_MODEL_ID') or default_model_id
SERVED_NAME = os.environ.get('PLAMO_SERVED_NAME') or 'plamo-3-translate-8b'
MAX_MODEL_LEN = os.environ.get('PLAMO_MAX_MODEL_LEN') or '4096'
PORT = os.environ.get('PLAMO_PORT') or '8000'
dtype = 'float16' if is_t4 else 'auto'
print(f'[INFO] GPU: {gpu_name} | dtype: {dtype} | model: {MODEL_ID}', flush=True)

cmd = [
  'vllm',
  'serve',
  MODEL_ID,
  '--served-model-name',
  SERVED_NAME,
  '--trust-remote-code',
  '--dtype',
  dtype,
  '--max-model-len',
  MAX_MODEL_LEN,
  '--host',
  '127.0.0.1',
  '--port',
  PORT,
]

sys.exit(subprocess.call(cmd))
