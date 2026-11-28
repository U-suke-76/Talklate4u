import { describe, it, expect } from 'vitest';
import { RateLimitFallbackController } from '../../src/utils/RateLimitFallback';

describe('RateLimitFallbackController', () => {
  it('backs off exponentially (60s -> 120s) and locks for session after 3rd 429', () => {
    const controller = new RateLimitFallbackController(60_000, 3);
    const t0 = 1_000_000;

    expect(controller.isInCooldown(t0)).toBe(false);
    expect(controller.hasActiveFailures()).toBe(false);

    // 1st 429 -> 60s
    const r1 = controller.recordRateLimit(t0);
    expect(r1).toEqual({
      consecutiveCount: 1,
      maxRetries: 3,
      stickySession: false,
      cooldownMs: 60_000,
    });
    expect(controller.hasActiveFailures()).toBe(true);
    expect(controller.isInCooldown(t0 + 59_999)).toBe(true);
    expect(controller.isInCooldown(t0 + 60_000)).toBe(false);

    // 2nd 429 -> 120s
    const t1 = t0 + 60_000;
    const r2 = controller.recordRateLimit(t1);
    expect(r2).toEqual({
      consecutiveCount: 2,
      maxRetries: 3,
      stickySession: false,
      cooldownMs: 120_000,
    });
    expect(controller.isInCooldown(t1 + 119_999)).toBe(true);
    expect(controller.isInCooldown(t1 + 120_000)).toBe(false);

    // 3rd 429 -> sticky session lock
    const t2 = t1 + 120_000;
    const r3 = controller.recordRateLimit(t2);
    expect(r3).toEqual({
      consecutiveCount: 3,
      maxRetries: 3,
      stickySession: true,
      cooldownMs: Number.POSITIVE_INFINITY,
    });
    expect(controller.isInCooldown(t2 + 86_400_000)).toBe(true);
  });

  it('clears cooldown and failure counter on reset()', () => {
    const controller = new RateLimitFallbackController();
    const t0 = 1_000_000;

    controller.recordRateLimit(t0);
    expect(controller.hasActiveFailures()).toBe(true);
    expect(controller.isInCooldown(t0 + 1000)).toBe(true);

    controller.reset();
    expect(controller.hasActiveFailures()).toBe(false);
    expect(controller.isInCooldown(t0 + 1000)).toBe(false);

    const next = controller.recordRateLimit(t0 + 2000);
    expect(next.consecutiveCount).toBe(1);
    expect(next.cooldownMs).toBe(60_000);
  });
});
