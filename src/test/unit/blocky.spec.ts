import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { BlockyConfigSchema } from '#db/repositories/blockyConfig/types';
import { Blocky } from '#server/utils/blocky';

const getConfig = vi.hoisted(() => vi.fn());

vi.mock('#server/utils/config', () => ({
  BLOCKY_ENV: {
    ENABLED: false,
    HOST: '127.0.0.1',
    HTTP_PORT: 4000,
    CONFIG: '/etc/blocky/config.yml',
  },
}));

vi.mock('#server/utils/Database', () => ({
  default: { blockyConfig: { getConfig } },
}));

const firstConfig: BlockyConfigSchema = {
  upstream: ['https://dns.google/dns-query'],
  bootstrapDns: ['1.1.1.1:53'],
  blocking: {
    blockType: 'zeroIp',
    blockLists: [],
    allowLists: [],
    clientGroupsBlock: { default: ['default'] },
  },
  caching: { minTime: '5m', maxTime: '30m', maxItemsCount: 10_000 },
  queryLog: { type: 'csv', target: '/data/blocky/logs', logRetentionDays: 7 },
  prometheus: { enable: true, path: '/metrics' },
  conditional: { mapping: {} },
};

const secondConfig: BlockyConfigSchema = {
  ...firstConfig,
  upstream: ['https://cloudflare-dns.com/dns-query'],
};

beforeEach(() => {
  getConfig.mockReset();
});

describe('Blocky config cache', () => {
  test('reuses reads until reloadConfig invalidates the cache', async () => {
    getConfig
      .mockResolvedValueOnce(firstConfig)
      .mockResolvedValueOnce(secondConfig);
    const blocky = new Blocky();

    await expect(blocky.getConfig()).resolves.toBe(firstConfig);
    await expect(blocky.getConfig()).resolves.toBe(firstConfig);
    expect(getConfig).toHaveBeenCalledTimes(1);

    await expect(blocky.reloadConfig()).resolves.toBe(secondConfig);
    await expect(blocky.getConfig()).resolves.toBe(secondConfig);
    expect(getConfig).toHaveBeenCalledTimes(2);
  });
});

describe('Blocky config serialization', () => {
  test('binds the HTTP API and metrics listener to the configured private host', () => {
    const blocky = new Blocky();

    expect(blocky.configToYaml(firstConfig)).toContain('http: 127.0.0.1:4000');
  });
});
