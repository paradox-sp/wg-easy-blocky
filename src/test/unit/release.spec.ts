import { beforeEach, describe, expect, test, vi } from 'vitest';

import { cachedFetchLatestRelease } from '#server/utils/release';

const fetchMock = vi.hoisted(() => vi.fn());
const debugMock = vi.hoisted(() => vi.fn());
const mockWgEnv = vi.hoisted(() => ({ DISABLE_VERSION_CHECK: false }));

vi.mock('ofetch', () => ({
  $fetch: fetchMock,
}));

vi.mock('#server/utils/config', () => ({
  RELEASE: 'v15.5.0',
  SERVER_DEBUG: debugMock,
  WG_ENV: mockWgEnv,
}));

beforeEach(() => {
  fetchMock.mockReset();
  debugMock.mockReset();
  mockWgEnv.DISABLE_VERSION_CHECK = false;
});

describe('release lookup', () => {
  test('returns and caches the current release when GitHub is unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('network unavailable'));
    await expect(cachedFetchLatestRelease()).resolves.toEqual({
      version: 'v15.5.0',
      changelog: '',
    });
    await expect(cachedFetchLatestRelease()).resolves.toEqual({
      version: 'v15.5.0',
      changelog: '',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(debugMock).toHaveBeenCalledOnce();
  });
});
