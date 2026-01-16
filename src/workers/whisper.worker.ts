/* eslint-disable @typescript-eslint/no-empty-function */
console.log('[Worker] Sanity Check: Started');
try {
  console.log('[Worker] Self:', typeof self);
  console.log('[Worker] URL present:', typeof URL !== 'undefined');
} catch (e) {
  console.error('[Worker] Sanity Check Failed:', e);
}

try {
  // Force Browser Mode by removing process global
  if (typeof process !== 'undefined') {
    try {
      // @ts-expect-error - Intentionally deleting from self
      delete self.process;
    } catch (_e) {
      /* ignore deletion error */
    }
    // @ts-expect-error - Intentionally setting undefined
    self.process = undefined;
    console.log('[Worker] Process global removed to force browser mode');
  }
} catch (e) {
  console.warn('[Worker] Process cleanup failed', e);
}

try {
  // Polyfill for libraries expecting 'window' or 'document'
  (self as unknown as Record<string, unknown>).window = self;
  (self as unknown as Record<string, unknown>).document = {
    createElement: () => ({
      style: {},
      setAttribute: () => {
        /* noop */
      },
      getElementsByTagName: () => [],
    }),
    createElementNS: () => ({
      style: {},
      setAttribute: () => {
        /* noop */
      },
    }),
    head: {
      appendChild: () => {
        /* noop */
      },
    },
    body: {
      appendChild: () => {
        /* noop */
      },
    },
    documentElement: { style: {} },
    location: self.location,
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    addEventListener: () => {
      /* noop */
    },
    removeEventListener: () => {
      /* noop */
    },
  };

  // Polyfill URL if missing (unlikely in modern browsers/electron but fix for 'create' error if generic)
  if (typeof URL === 'undefined') {
    console.error('[Worker] URL is undefined');
  } else {
    console.log('[Worker] URL is present');
    // Verify createObjectURL
    if (!URL.createObjectURL) console.error('[Worker] URL.createObjectURL is missing');
    else console.log('[Worker] URL.createObjectURL is present');
  }
} catch (e) {
  console.error('[Worker] Polyfill error:', e);
}

// Define types for lazy loading
type PipelineFunction = typeof import('@huggingface/transformers').pipeline;
type EnvObject = typeof import('@huggingface/transformers').env;

let pipeline: PipelineFunction | null = null;
let env: EnvObject | null = null;

// Singleton reference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let currentModelId = '';

// Initialize library asynchronously
const initPromise = (async () => {
  try {
    const transformers = await import('@huggingface/transformers');
    pipeline = transformers.pipeline;
    env = transformers.env;

    // Configure env
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    // Configure WASM paths and disable proxy (important for Worker)
    if (env.backends?.onnx?.wasm) {
      // Point to root where vite-static-copy put the files
      env.backends.onnx.wasm.wasmPaths = '/';
      // Disable proxying, as we are already in a worker
      env.backends.onnx.wasm.proxy = false;
    }

    console.log('[Worker] Transformers loaded. Env:', {
      version: env.version,
      backends: !!env.backends,
    });
  } catch (e) {
    console.error('[Worker] Failed to load transformers:', e);
    throw e;
  }
})();

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  try {
    // Ensure library is loaded
    await initPromise;

    if (type === 'load') {
      const { modelId, device } = data;

      if (transcriber && currentModelId === modelId) {
        self.postMessage({ type: 'status', status: 'ready' });
        return;
      }

      self.postMessage({ type: 'status', status: 'init', message: `Loading ${modelId}...` });

      // Dispose old if exists
      if (transcriber) {
        if (transcriber.dispose) await transcriber.dispose();
        transcriber = null;
      }

      const dtype = device === 'webgpu' ? 'fp32' : 'q8';

      if (device === 'webgpu') {
        // @ts-expect-error - navigator.gpu is experimental
        const gpu = navigator.gpu;
        console.log('[Worker] WebGPU check:', !!gpu);
        if (!gpu) {
          throw new Error('WebGPU is not available in this Worker environment. Try CPU.');
        }
      }

      console.log(`[Worker] Loading model: ${modelId} on ${device} with ${dtype}`);

      if (!pipeline) throw new Error('Pipeline not initialized');

      transcriber = await pipeline('automatic-speech-recognition', modelId, {
        dtype: dtype,
        device: device,
        progress_callback: (cbData: Record<string, unknown>) => {
          self.postMessage({ type: 'progress', data: cbData });
        },
      });

      currentModelId = modelId;
      self.postMessage({ type: 'status', status: 'ready' });
    } else if (type === 'transcribe') {
      if (!transcriber) {
        console.error('[Worker] Model not loaded during transcribe request');
        throw new Error('Model not loaded');
      }

      const { audio, language } = data;
      console.log(`[Worker] Transcribing... Audio length: ${audio.length}, Language: ${language}`);

      const generation_kwargs = {
        language: language === 'auto' ? undefined : language,
        task: 'transcribe',
      };

      const output = await transcriber(audio, {
        generation_kwargs,
      });

      console.log('[Worker] Transcription output raw:', output);

      const text = (output as { text?: string }).text || '';
      console.log(`[Worker] Transcribed text: "${text}"`);

      self.postMessage({
        type: 'result',
        data: {
          text: text.trim(),
          language: language,
        },
      });
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : '';
    console.error('[Worker] Error:', err);
    self.postMessage({
      type: 'error',
      error: errorMessage + (errorStack ? '\n' + errorStack : ''),
    });
  }
});
