import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

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

def run_warmup(port: str, served_name: str) -> None:
  models_url = f'http://127.0.0.1:{port}/v1/models'
  chat_url = f'http://127.0.0.1:{port}/v1/chat/completions'
  while True:
    try:
      with urllib.request.urlopen(models_url, timeout=2) as res:
        if res.status == 200:
          break
    except Exception:
      time.sleep(1)

  try:
    start = time.time()
    payload = json.dumps(
      {
        'model': served_name,
        'messages': [{'role': 'user', 'content': 'Hello'}],
        'chat_template_kwargs': {'target_lang': 'ja', 'form': 'plain'},
        'max_tokens': 16,
        'temperature': 0.0,
      }
    ).encode('utf-8')
    req = urllib.request.Request(
      chat_url,
      data=payload,
      headers={'Content-Type': 'application/json', 'Authorization': 'Bearer dummy'},
      method='POST',
    )
    with urllib.request.urlopen(req, timeout=60) as res:
      res.read()
    elapsed_ms = int((time.time() - start) * 1000)
    print(f'[INFO] Warmup complete ({elapsed_ms}ms). Ready for low-latency translation!', flush=True)
  except Exception as e:
    print(f'[WARN] Warmup request failed (server is still usable): {e}', flush=True)


threading.Thread(target=run_warmup, args=(PORT, SERVED_NAME), daemon=True).start()
sys.exit(subprocess.call(cmd))
