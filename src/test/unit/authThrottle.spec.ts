import { describe, expect, test, vi } from 'vitest';

import { AuthenticationThrottle } from '#server/utils/authThrottle';

vi.mock('#server/utils/config', () => ({
  WG_ENV: { TRUSTED_PROXIES: [] },
}));

const options = {
  identityLimit: 5,
  ipLimit: 20,
  windowMs: 15 * 60 * 1000,
  initialCooldownMs: 30 * 1000,
  maximumCooldownMs: 15 * 60 * 1000,
  maximumEntries: 100,
};

describe('AuthenticationThrottle', () => {
  test('blocks an identity on the fifth failure and doubles the next cooldown', () => {
    const throttle = new AuthenticationThrottle(options);

    for (let attempt = 1; attempt < options.identityLimit; attempt++) {
      expect(
        throttle.recordFailure('password', '192.0.2.10', 'Admin', 0)
      ).toBeNull();
    }

    expect(throttle.recordFailure('password', '192.0.2.10', 'Admin', 0)).toBe(
      30
    );
    expect(
      throttle.retryAfterSeconds('password', '192.0.2.10', 'admin', 29_001)
    ).toBe(1);
    expect(
      throttle.retryAfterSeconds('password', '192.0.2.10', 'admin', 30_000)
    ).toBeNull();
    expect(
      throttle.recordFailure('password', '192.0.2.10', 'admin', 30_000)
    ).toBe(60);
  });

  test('blocks username spraying by IP without affecting another IP', () => {
    const throttle = new AuthenticationThrottle({
      ...options,
      identityLimit: 5,
      ipLimit: 3,
    });

    expect(
      throttle.recordFailure('password', '192.0.2.10', 'one', 0)
    ).toBeNull();
    expect(
      throttle.recordFailure('password', '192.0.2.10', 'two', 0)
    ).toBeNull();
    expect(throttle.recordFailure('password', '192.0.2.10', 'three', 0)).toBe(
      30
    );

    expect(
      throttle.retryAfterSeconds('password', '192.0.2.10', 'four', 0)
    ).toBe(30);
    expect(
      throttle.retryAfterSeconds('password', '198.51.100.8', 'four', 0)
    ).toBeNull();
  });

  test('successful authentication clears both identity and IP failures', () => {
    const throttle = new AuthenticationThrottle(options);

    for (let attempt = 0; attempt < 4; attempt++) {
      throttle.recordFailure('password', '192.0.2.10', 'admin', 0);
    }
    throttle.clear('password', '192.0.2.10', 'admin');

    for (let attempt = 0; attempt < 4; attempt++) {
      expect(
        throttle.recordFailure('password', '192.0.2.10', 'admin', 1)
      ).toBeNull();
    }
  });

  test('password and two-factor counters are isolated', () => {
    const throttle = new AuthenticationThrottle({
      ...options,
      identityLimit: 1,
    });

    expect(throttle.recordFailure('password', '192.0.2.10', 'admin', 0)).toBe(
      30
    );
    expect(throttle.retryAfterSeconds('2fa', '192.0.2.10', '1', 0)).toBeNull();
  });

  test('keeps IPv6 addresses separate from identity delimiters', () => {
    const throttle = new AuthenticationThrottle({
      ...options,
      identityLimit: 1,
    });

    expect(
      throttle.recordFailure('password', '2001:db8::1', '2:admin', 0)
    ).toBe(30);
    expect(
      throttle.retryAfterSeconds('password', '2001:db8::1:2', 'admin', 0)
    ).toBeNull();
  });

  test('expired failures do not count toward a later window', () => {
    const throttle = new AuthenticationThrottle({
      ...options,
      identityLimit: 2,
      windowMs: 1_000,
      initialCooldownMs: 100,
    });

    expect(
      throttle.recordFailure('password', '192.0.2.10', 'admin', 0)
    ).toBeNull();
    expect(
      throttle.recordFailure('password', '192.0.2.10', 'admin', 1_001)
    ).toBeNull();
  });

  test('exponential cooldown is capped', () => {
    const throttle = new AuthenticationThrottle({
      ...options,
      identityLimit: 1,
      initialCooldownMs: 1_000,
      maximumCooldownMs: 2_000,
    });

    expect(throttle.recordFailure('password', '192.0.2.10', 'admin', 0)).toBe(
      1
    );
    expect(
      throttle.recordFailure('password', '192.0.2.10', 'admin', 1_000)
    ).toBe(2);
    expect(
      throttle.recordFailure('password', '192.0.2.10', 'admin', 3_000)
    ).toBe(2);
  });
});
