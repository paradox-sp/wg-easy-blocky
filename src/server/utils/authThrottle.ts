import { createError, setResponseHeader, type H3Event } from 'h3';

import { WG_ENV } from '#server/utils/config';
import { logSecurityEvent } from '#server/utils/securityLogger';
import { getTrustedRequestIP } from '#server/utils/trustedProxy';

export type AuthenticationFactor = 'password' | '2fa';

type AttemptState = {
  failures: number;
  lastFailureAt: number;
  blockedUntil: number;
};

export type AuthenticationThrottleOptions = {
  identityLimit: number;
  ipLimit: number;
  windowMs: number;
  initialCooldownMs: number;
  maximumCooldownMs: number;
  maximumEntries: number;
};

const DEFAULT_OPTIONS: AuthenticationThrottleOptions = {
  identityLimit: 5,
  ipLimit: 20,
  windowMs: 15 * 60 * 1000,
  initialCooldownMs: 30 * 1000,
  maximumCooldownMs: 15 * 60 * 1000,
  maximumEntries: 10_000,
};

/**
 * Process-local authentication throttle for the single-container runtime.
 * Identity limits are scoped to the client IP to avoid account-wide lockout
 * attacks, while a separate IP limit prevents username spraying.
 */
export class AuthenticationThrottle {
  readonly #entries = new Map<string, AttemptState>();
  readonly #options: AuthenticationThrottleOptions;
  #operations = 0;

  constructor(options: Partial<AuthenticationThrottleOptions> = {}) {
    this.#options = { ...DEFAULT_OPTIONS, ...options };
  }

  retryAfterSeconds(
    factor: AuthenticationFactor,
    ip: string,
    identity: string,
    now = Date.now()
  ): number | null {
    this.#maybePrune(now);

    const ipRetry = this.#retryAfter(this.#ipKey(factor, ip), now);
    const identityRetry = this.#retryAfter(
      this.#identityKey(factor, ip, identity),
      now
    );
    const retryAfter = Math.max(ipRetry, identityRetry);

    return retryAfter > 0 ? Math.ceil(retryAfter / 1000) : null;
  }

  recordFailure(
    factor: AuthenticationFactor,
    ip: string,
    identity: string,
    now = Date.now()
  ): number | null {
    this.#maybePrune(now);

    const ipRetry = this.#record(
      this.#ipKey(factor, ip),
      this.#options.ipLimit,
      now
    );
    const identityRetry = this.#record(
      this.#identityKey(factor, ip, identity),
      this.#options.identityLimit,
      now
    );
    const retryAfter = Math.max(ipRetry, identityRetry);

    return retryAfter > 0 ? Math.ceil(retryAfter / 1000) : null;
  }

  clear(factor: AuthenticationFactor, ip: string, identity: string): void {
    this.#entries.delete(this.#ipKey(factor, ip));
    this.#entries.delete(this.#identityKey(factor, ip, identity));
  }

  #record(key: string, limit: number, now: number): number {
    let state = this.#entries.get(key);
    if (
      state &&
      now - state.lastFailureAt >= this.#options.windowMs &&
      state.blockedUntil <= now
    ) {
      this.#entries.delete(key);
      state = undefined;
    }

    if (!state) {
      this.#ensureCapacity(now);
      state = { failures: 0, lastFailureAt: now, blockedUntil: 0 };
      this.#entries.set(key, state);
    }

    state.failures += 1;
    state.lastFailureAt = now;

    if (state.failures >= limit) {
      const exponent = state.failures - limit;
      const cooldown = Math.min(
        this.#options.initialCooldownMs * 2 ** exponent,
        this.#options.maximumCooldownMs
      );
      state.blockedUntil = now + cooldown;
    }

    return Math.max(0, state.blockedUntil - now);
  }

  #retryAfter(key: string, now: number): number {
    const state = this.#entries.get(key);
    if (!state) return 0;

    if (
      now - state.lastFailureAt >= this.#options.windowMs &&
      state.blockedUntil <= now
    ) {
      this.#entries.delete(key);
      return 0;
    }

    return Math.max(0, state.blockedUntil - now);
  }

  #maybePrune(now: number): void {
    this.#operations += 1;
    if (this.#operations % 256 === 0) {
      this.#prune(now);
    }
  }

  #ensureCapacity(now: number): void {
    if (this.#entries.size < this.#options.maximumEntries) return;

    this.#prune(now);
    if (this.#entries.size < this.#options.maximumEntries) return;

    const oldestKey = this.#entries.keys().next().value;
    if (oldestKey !== undefined) {
      this.#entries.delete(oldestKey);
    }
  }

  #prune(now: number): void {
    for (const [key, state] of this.#entries) {
      if (
        now - state.lastFailureAt >= this.#options.windowMs &&
        state.blockedUntil <= now
      ) {
        this.#entries.delete(key);
      }
    }
  }

  #ipKey(factor: AuthenticationFactor, ip: string): string {
    return `${factor}:ip:${ip}`;
  }

  #identityKey(
    factor: AuthenticationFactor,
    ip: string,
    identity: string
  ): string {
    const normalizedIdentity = identity.trim().toLowerCase();
    return `${factor}:identity:${ip.length}:${ip}:${normalizedIdentity}`;
  }
}

const authenticationThrottle = new AuthenticationThrottle();

function getClientIp(event: H3Event): string {
  return getTrustedRequestIP(event, WG_ENV.TRUSTED_PROXIES) ?? 'unknown';
}

function throwThrottled(
  event: H3Event,
  factor: AuthenticationFactor,
  identity: string,
  retryAfterSeconds: number
): never {
  setResponseHeader(event, 'Retry-After', retryAfterSeconds);
  logSecurityEvent(
    event,
    factor === 'password' ? 'password-throttled' : '2fa-throttled',
    factor === 'password' ? identity : undefined
  );

  throw createError({
    statusCode: 429,
    statusMessage: `Too many authentication attempts. Try again in ${retryAfterSeconds} seconds.`,
    data: { retryAfterSeconds },
  });
}

export function assertAuthenticationAllowed(
  event: H3Event,
  factor: AuthenticationFactor,
  identity: string
): void {
  const retryAfter = authenticationThrottle.retryAfterSeconds(
    factor,
    getClientIp(event),
    identity
  );
  if (retryAfter !== null) {
    throwThrottled(event, factor, identity, retryAfter);
  }
}

export function recordAuthenticationFailure(
  event: H3Event,
  factor: AuthenticationFactor,
  identity: string
): void {
  const retryAfter = authenticationThrottle.recordFailure(
    factor,
    getClientIp(event),
    identity
  );
  if (retryAfter !== null) {
    throwThrottled(event, factor, identity, retryAfter);
  }
}

export function clearAuthenticationFailures(
  event: H3Event,
  factor: AuthenticationFactor,
  identity: string
): void {
  authenticationThrottle.clear(factor, getClientIp(event), identity);
}
