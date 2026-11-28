import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

import { AsrService } from '../../src/server/AsrService';
import { ConfigManager } from '../../src/managers/ConfigManager';
import type { SenseVoiceManager } from '../../src/server/SenseVoiceManager';
import type { WhisperManager } from '../../src/server/WhisperManager';

class FakeWhisperManager extends EventEmitter {
  public isDownloading = false;
  public downloadProgress = '';
  public start = vi.fn().mockResolvedValue(undefined);
  public stop = vi.fn();
  public checkStatus = vi.fn().mockResolvedValue({ running: true });
  public transcribe = vi.fn();
  public getModelsDir = vi.fn().mockReturnValue('/tmp');
  public downloadModel = vi.fn().mockResolvedValue(undefined);
}

class FakeSenseVoiceManager extends EventEmitter {
  public isDownloading = false;
  public downloadProgress = '';
  public running = false;
  public start = vi.fn().mockImplementation(async () => {
    this.running = true;
  });
  public stop = vi.fn().mockImplementation(() => {
    this.running = false;
  });
  public checkStatus = vi.fn().mockImplementation(async () => ({ running: this.running }));
  public transcribe = vi.fn();
}

function mockGroqWhisperConfig(fallbackToSenseVoice: boolean) {
  vi.spyOn(ConfigManager, 'getInstance').mockReturnValue({
    getConfig: () => ({
      whisper: {
        provider: 'groq',
        model: 'whisper-large-v3-turbo',
        language: 'ja',
        serverPort: 8081,
        apiKey: 'gsk_test',
        fallbackToSenseVoice,
      },
      llm: {
        provider: 'groq',
        apiKey: 'gsk_test',
        model: 'auto',
      },
    }),
  } as unknown as ConfigManager);
}

describe('AsrService Groq Whisper -> SenseVoice fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-28T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('falls back to SenseVoice-Small on Groq 429, stays during cooldown, and recovers after cooldown', async () => {
    mockGroqWhisperConfig(true);
    const whisper = new FakeWhisperManager();
    const senseVoice = new FakeSenseVoiceManager();

    whisper.transcribe
      .mockResolvedValueOnce({
        error: 'Transcribe Failed',
        details: 'Request failed with status code 429',
        status: 429,
      })
      .mockResolvedValueOnce({ text: 'Groq recovered', language: 'ja' });

    senseVoice.transcribe
      .mockResolvedValueOnce({ text: 'SenseVoice 1', language: 'ja' })
      .mockResolvedValueOnce({ text: 'SenseVoice 2', language: 'ja' });

    const service = new AsrService(
      whisper as unknown as WhisperManager,
      senseVoice as unknown as SenseVoiceManager,
    );
    const buf = new ArrayBuffer(8);

    // 1st call: Groq 429 -> fallback to SenseVoice (60s cooldown)
    const r1 = await service.transcribe(buf);
    expect(r1.text).toBe('SenseVoice 1');
    expect(whisper.transcribe).toHaveBeenCalledTimes(1);
    expect(senseVoice.start).toHaveBeenCalledTimes(1);
    expect(senseVoice.transcribe).toHaveBeenCalledTimes(1);

    // 2nd call within cooldown: skips Groq and calls SenseVoice directly
    vi.advanceTimersByTime(30 * 1000);
    const r2 = await service.transcribe(buf);
    expect(r2.text).toBe('SenseVoice 2');
    expect(whisper.transcribe).toHaveBeenCalledTimes(1);
    expect(senseVoice.transcribe).toHaveBeenCalledTimes(2);

    // 3rd call after 60s cooldown: retries Groq and succeeds
    vi.advanceTimersByTime(31 * 1000);
    const r3 = await service.transcribe(buf);
    expect(r3.text).toBe('Groq recovered');
    expect(whisper.transcribe).toHaveBeenCalledTimes(2);
  });

  it('backs off cooldown exponentially (60s -> 120s) and locks to SenseVoice after 3 consecutive 429s', async () => {
    mockGroqWhisperConfig(true);
    const whisper = new FakeWhisperManager();
    const senseVoice = new FakeSenseVoiceManager();

    whisper.transcribe.mockResolvedValue({
      error: 'Transcribe Failed',
      details: 'Rate limit exceeded (429)',
      status: 429,
    });
    senseVoice.transcribe.mockResolvedValue({ text: 'Local OK', language: 'ja' });

    const service = new AsrService(
      whisper as unknown as WhisperManager,
      senseVoice as unknown as SenseVoiceManager,
    );
    const buf = new ArrayBuffer(8);

    // 1st 429 -> 60s cooldown
    await service.transcribe(buf);
    expect(whisper.transcribe).toHaveBeenCalledTimes(1);

    // After 61s -> 2nd 429 -> 120s cooldown
    vi.advanceTimersByTime(61 * 1000);
    await service.transcribe(buf);
    expect(whisper.transcribe).toHaveBeenCalledTimes(2);

    // After 90s (still inside 120s) -> skips Groq
    vi.advanceTimersByTime(90 * 1000);
    await service.transcribe(buf);
    expect(whisper.transcribe).toHaveBeenCalledTimes(2);

    // After another 31s (>120s) -> 3rd 429 -> session lock
    vi.advanceTimersByTime(31 * 1000);
    await service.transcribe(buf);
    expect(whisper.transcribe).toHaveBeenCalledTimes(3);

    // Even after 1 hour, stays on SenseVoice
    vi.advanceTimersByTime(60 * 60 * 1000);
    await service.transcribe(buf);
    expect(whisper.transcribe).toHaveBeenCalledTimes(3);
    expect(senseVoice.transcribe).toHaveBeenCalledTimes(5);
  });

  it('does not fall back when fallbackToSenseVoice is disabled', async () => {
    mockGroqWhisperConfig(false);
    const whisper = new FakeWhisperManager();
    const senseVoice = new FakeSenseVoiceManager();

    whisper.transcribe.mockResolvedValue({
      error: 'Transcribe Failed',
      details: 'Request failed with status code 429',
      status: 429,
    });

    const service = new AsrService(
      whisper as unknown as WhisperManager,
      senseVoice as unknown as SenseVoiceManager,
    );
    const res = await service.transcribe(new ArrayBuffer(8));

    expect(res.error).toBe('Transcribe Failed');
    expect(senseVoice.start).not.toHaveBeenCalled();
    expect(senseVoice.transcribe).not.toHaveBeenCalled();
  });
});
