export interface RateLimitFallbackRecord {
  consecutiveCount: number;
  maxRetries: number;
  stickySession: boolean;
  cooldownMs: number;
}

/**
 * Tracks consecutive rate-limit (HTTP 429) failures and computes exponential
 * backoff cooldowns before locking to the fallback provider for the session.
 */
export class RateLimitFallbackController {
  private cooldownUntil = 0;
  private consecutive429Count = 0;

  constructor(
    private readonly baseCooldownMs = 60 * 1000,
    private readonly maxRecoveryRetries = 3,
  ) {}

  public isInCooldown(now = Date.now()): boolean {
    return now < this.cooldownUntil;
  }

  public hasActiveFailures(): boolean {
    return this.cooldownUntil > 0 || this.consecutive429Count > 0;
  }

  public recordRateLimit(now = Date.now()): RateLimitFallbackRecord {
    this.consecutive429Count += 1;
    if (this.consecutive429Count >= this.maxRecoveryRetries) {
      this.cooldownUntil = Number.POSITIVE_INFINITY;
      return {
        consecutiveCount: this.consecutive429Count,
        maxRetries: this.maxRecoveryRetries,
        stickySession: true,
        cooldownMs: Number.POSITIVE_INFINITY,
      };
    }

    const cooldownMs = this.baseCooldownMs * Math.pow(2, this.consecutive429Count - 1);
    this.cooldownUntil = now + cooldownMs;
    return {
      consecutiveCount: this.consecutive429Count,
      maxRetries: this.maxRecoveryRetries,
      stickySession: false,
      cooldownMs,
    };
  }

  public reset(): void {
    this.cooldownUntil = 0;
    this.consecutive429Count = 0;
  }
}
