import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoadModelFromHF = vi.fn();
const mockLoadModelFromUrl = vi.fn();
const mockCreateChatCompletion = vi.fn();
const mockCreateCompletion = vi.fn();
const mockExit = vi.fn();

vi.mock('@wllama/wllama', () => {
  return {
    Wllama: vi.fn().mockImplementation(function () {
      return {
        loadModelFromHF: mockLoadModelFromHF,
        loadModelFromUrl: mockLoadModelFromUrl,
        createChatCompletion: mockCreateChatCompletion,
        createCompletion: mockCreateCompletion,
        exit: mockExit,
      };
    }),
  };
});

import { WllamaEngine, PlamoLocalService } from '../../src/services/wllama/WllamaEngine';

describe('WllamaEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadModelFromHF.mockResolvedValue(undefined);
    mockLoadModelFromUrl.mockResolvedValue(undefined);
    mockCreateChatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'Hello' } }],
    });
    mockCreateCompletion.mockResolvedValue({
      choices: [{ text: 'Fallback Hello' }],
    });
    mockExit.mockResolvedValue(undefined);
  });

  it('loads model from HF with useCache=true by default and becomes ready', async () => {
    const engine = new WllamaEngine({
      hfModelId: 'pfnet/plamo-3-translate-0.8b-GGUF',
      hfFile: 'plamo-3-translate-0.8b-Q4_K_M.gguf',
    });

    expect(engine.isReady()).toBe(false);
    await engine.init();
    expect(engine.isReady()).toBe(true);

    expect(mockLoadModelFromHF).toHaveBeenCalledTimes(1);
    expect(mockLoadModelFromHF).toHaveBeenCalledWith(
      {
        repo: 'pfnet/plamo-3-translate-0.8b-GGUF',
        file: 'plamo-3-translate-0.8b-Q4_K_M.gguf',
        quant: undefined,
      },
      expect.objectContaining({ useCache: true }),
    );
  });

  it('falls back to useCache=false when OPFS removeEntry lock error occurs', async () => {
    mockLoadModelFromHF
      .mockRejectedValueOnce(
        new Error(
          "Failed to execute 'removeEntry' on 'FileSystemDirectoryHandle': An attempt was made to modify an object where modifications are not allowed.",
        ),
      )
      .mockResolvedValueOnce(undefined);

    const engine = new WllamaEngine({
      hfModelId: 'pfnet/plamo-3-translate-0.8b-GGUF',
      hfFile: 'plamo-3-translate-0.8b-Q4_K_M.gguf',
    });

    await engine.init();
    expect(engine.isReady()).toBe(true);
    expect(mockLoadModelFromHF).toHaveBeenCalledTimes(2);
    expect(mockLoadModelFromHF.mock.calls[0][1]).toEqual(
      expect.objectContaining({ useCache: true }),
    );
    expect(mockLoadModelFromHF.mock.calls[1][1]).toEqual(
      expect.objectContaining({ useCache: false }),
    );
  });

  it('does not fall back on non-OPFS errors such as network failures', async () => {
    mockLoadModelFromHF.mockRejectedValueOnce(new Error('NetworkError: Failed to fetch'));

    const engine = new WllamaEngine({
      hfModelId: 'pfnet/plamo-3-translate-0.8b-GGUF',
      hfFile: 'plamo-3-translate-0.8b-Q4_K_M.gguf',
    });

    await expect(engine.init()).rejects.toThrow('NetworkError: Failed to fetch');
    expect(engine.isReady()).toBe(false);
    expect(mockLoadModelFromHF).toHaveBeenCalledTimes(1);
  });

  it('disposes the underlying wllama instance and resets ready state', async () => {
    const engine = new WllamaEngine({
      hfModelId: 'pfnet/plamo-3-translate-0.8b-GGUF',
      hfFile: 'plamo-3-translate-0.8b-Q4_K_M.gguf',
    });

    await engine.init();
    expect(engine.isReady()).toBe(true);

    await engine.dispose();
    expect(mockExit).toHaveBeenCalledTimes(1);
    expect(engine.isReady()).toBe(false);
  });
});

describe('PlamoLocalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadModelFromHF.mockResolvedValue(undefined);
    mockCreateChatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'Translated' } }],
    });
    mockCreateCompletion.mockResolvedValue({
      choices: [{ text: 'Fallback Translated' }],
    });
    mockExit.mockResolvedValue(undefined);
    // Reset singleton state between tests
    (PlamoLocalService as unknown as { instance?: PlamoLocalService }).instance = undefined;
  });

  it('reuses loaded engine when ensureLoaded is called again with the same model', async () => {
    const service = PlamoLocalService.getInstance();

    await service.ensureLoaded('plamo-3-translate-0.8b');
    await service.ensureLoaded('plamo-3-translate-0.8b');

    expect(mockLoadModelFromHF).toHaveBeenCalledTimes(1);
    expect(mockExit).not.toHaveBeenCalled();
    expect(service.getStatus()).toEqual({
      ready: true,
      loading: false,
      progress: '',
      model: 'plamo-3-translate-0.8b',
    });
  });

  it('disposes previous engine and loads new model when switching from 0.8b to 2b', async () => {
    const service = PlamoLocalService.getInstance();

    await service.ensureLoaded('plamo-3-translate-0.8b');
    await service.ensureLoaded('plamo-3-translate-2b');

    expect(mockExit).toHaveBeenCalledTimes(1);
    expect(mockLoadModelFromHF).toHaveBeenCalledTimes(2);
    expect(mockLoadModelFromHF.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        repo: 'pfnet/plamo-3-translate-2b-GGUF',
        file: 'plamo-3-translate-2b-Q4_K_M.gguf',
      }),
    );
    expect(service.getStatus().model).toBe('plamo-3-translate-2b');
  });

  it('falls back to generate() with fallbackPrompt when chat() returns empty string', async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
    });

    const service = PlamoLocalService.getInstance();
    const out = await service.execute({
      modelId: 'plamo-3-translate-0.8b',
      messages: [{ role: 'user', content: 'こんにちは' }],
      fallbackPrompt: '<|plamo:op|>dataset\ntranslation\nこんにちは',
      stop: ['<|plamo:op|>'],
    });

    expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
    expect(mockCreateCompletion).toHaveBeenCalledTimes(1);
    expect(out).toBe('Fallback Translated');
  });
});
