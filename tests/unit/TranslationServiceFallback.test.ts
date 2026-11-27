import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranslationService } from '../../src/services/TranslationService';
import { ConfigManager } from '../../src/managers/ConfigManager';
import type { OverlayServer } from '../../src/server/OverlayServer';
import type { AppConfig } from '../../src/types/config';

const mockCreate = vi.fn();

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
}));

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

function createMockConfig(fallbackToPlamoLocal: boolean): AppConfig {
  return {
    whisper: {
      model: 'ggml-base.bin',
      serverPort: 8081,
      language: 'ko',
      provider: 'local',
    },
    llm: {
      provider: 'groq',
      apiKey: 'gsk_test',
      model: 'qwen/qwen3.8-27b',
      groqModels: ['qwen/qwen3.8-27b'],
      fallbackToPlamoLocal,
    },
    translation: {
      targetLang: 'ja',
      streamingDisplay: false,
    },
    vad: {
      silenceDurationMs: 500,
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      minSpeechMs: 250,
    },
    overlay: {
      port: 9000,
      styles: {
        align: 'left',
        fontSize: 16,
        originalColor: '#ffffff',
        originalStrokeColor: '#000000',
        translatedColor: '#38bdf8',
        translatedStrokeColor: '#0c4a6e',
        backgroundColor: 'transparent',
        displayFormat: '%1(%2)',
        maxLines: 0,
        fadeTimeout: 0,
        useCustomCSS: false,
        customCSS: '',
      },
    },
    app: { defaultMicName: '' },
    glossary: [],
    glossaryPacks: [],
  };
}

describe('TranslationService Groq -> PLaMo 0.8B fallback', () => {
  const broadcast = vi.fn();
  const onLog = vi.fn();
  const mockOverlay = { broadcast } as unknown as OverlayServer;
  const mockLocalTranslator = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('falls back to plamo-3-translate-0.8b on Groq 429, skips Groq during cooldown, and recovers after cooldown', async () => {
    vi.spyOn(ConfigManager, 'getInstance').mockReturnValue({
      getConfig: () => createMockConfig(true),
      save: vi.fn(),
    } as unknown as ConfigManager);

    const service = new TranslationService(mockOverlay, onLog);
    service.setLocalTranslator(mockLocalTranslator);

    // 1st call: Groq returns 429 -> fallback to PLaMo 0.8B
    mockCreate.mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded' });
    mockLocalTranslator.mockResolvedValueOnce('こんにちは');

    const res1 = await service.translate('안녕하세요', 'ko');
    expect(res1).toEqual({ text: 'こんにちは' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockLocalTranslator).toHaveBeenCalledTimes(1);
    expect(mockLocalTranslator.mock.calls[0][0].model).toBe('plamo-3-translate-0.8b');
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('[Fallback] Groq Rate Limit (429)'));

    // 2nd call within 60s cooldown: should go directly to PLaMo 0.8B without calling Groq
    vi.advanceTimersByTime(30_000);
    mockLocalTranslator.mockResolvedValueOnce('ありがとう');

    const res2 = await service.translate('감사합니다', 'ko');
    expect(res2).toEqual({ text: 'ありがとう' });
    expect(mockCreate).toHaveBeenCalledTimes(1); // still 1
    expect(mockLocalTranslator).toHaveBeenCalledTimes(2);

    // 3rd call after 60s cooldown: retries Groq and recovers
    vi.advanceTimersByTime(31_000);
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'さようなら' } }],
    });

    const res3 = await service.translate('안녕히 가세요', 'ko');
    expect(res3).toEqual({ text: 'さようなら' });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockLocalTranslator).toHaveBeenCalledTimes(2); // still 2
    expect(onLog).toHaveBeenCalledWith(expect.stringContaining('[Fallback] Groq recovered'));
  });

  it('returns rate limit error without calling local translator when fallbackToPlamoLocal is false', async () => {
    vi.spyOn(ConfigManager, 'getInstance').mockReturnValue({
      getConfig: () => createMockConfig(false),
      save: vi.fn(),
    } as unknown as ConfigManager);

    const service = new TranslationService(mockOverlay, onLog);
    service.setLocalTranslator(mockLocalTranslator);

    mockCreate.mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded' });

    const res = await service.translate('안녕하세요', 'ko');
    expect(res.text).toBeNull();
    expect(res.error).toContain('Rate Limit Exceeded');
    expect(mockLocalTranslator).not.toHaveBeenCalled();
  });

  it('backs off cooldown exponentially (60s -> 120s) and stays on PLaMo for the session after 3 consecutive 429s', async () => {
    vi.spyOn(ConfigManager, 'getInstance').mockReturnValue({
      getConfig: () => createMockConfig(true),
      save: vi.fn(),
    } as unknown as ConfigManager);

    const service = new TranslationService(mockOverlay, onLog);
    service.setLocalTranslator(mockLocalTranslator);

    // 1st 429 -> 60s cooldown
    mockCreate.mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded' });
    mockLocalTranslator.mockResolvedValueOnce('1回目');
    expect(await service.translate('첫번째', 'ko')).toEqual({ text: '1回目' });
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // After 61s -> 2nd 429 -> 120s cooldown
    vi.advanceTimersByTime(61_000);
    mockCreate.mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded' });
    mockLocalTranslator.mockResolvedValueOnce('2回目');
    expect(await service.translate('두번째', 'ko')).toEqual({ text: '2回目' });
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // After 90s (still within 120s cooldown) -> skips Groq
    vi.advanceTimersByTime(90_000);
    mockLocalTranslator.mockResolvedValueOnce('クールダウン中');
    expect(await service.translate('대기중', 'ko')).toEqual({ text: 'クールダウン中' });
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // After another 31s (total 121s) -> 3rd 429 -> permanently stays on PLaMo for session
    vi.advanceTimersByTime(31_000);
    mockCreate.mockRejectedValueOnce({ status: 429, message: 'Rate limit exceeded' });
    mockLocalTranslator.mockResolvedValueOnce('3回目');
    expect(await service.translate('세번째', 'ko')).toEqual({ text: '3回目' });
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(onLog).toHaveBeenCalledWith(
      expect.stringContaining('Staying on PLaMo 3 Translate 0.8B (Local) for this session'),
    );

    // Even after 1 hour -> never calls Groq again in this session
    vi.advanceTimersByTime(3_600_000);
    mockLocalTranslator.mockResolvedValueOnce('固定後');
    expect(await service.translate('고정후', 'ko')).toEqual({ text: '固定後' });
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });
});
