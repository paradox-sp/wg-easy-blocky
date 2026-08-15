import { describe, expect, it, test, vi } from 'vitest';

import type { DBType } from '#db/sqlite';
import { BlockyConfigService } from '#server/database/repositories/blockyConfig/service';
import { BlockyConfigUpdateSchema } from '#server/database/repositories/blockyConfig/types';

// The service reads BLOCKY_ENV.LOG_DIR at runtime (it is the default queryLog
// target). Mocking the config module keeps the test deterministic and avoids
// the real module's top-level env assertions (e.g. the missing PORT var).
const mockBlockyEnv = vi.hoisted(() => ({
  ENABLED: true,
  HOST: '127.0.0.1',
  CONFIG: '/etc/blocky/config.yml',
  LOG_DIR: '/data/blocky/logs',
  HTTP_PORT: 4000,
}));

vi.mock('#server/utils/config', () => ({
  BLOCKY_ENV: mockBlockyEnv,
}));

// Mirrors #getDefaults() in
// src/server/database/repositories/blockyConfig/service.ts (lines 82-106).
const DEFAULT_CONFIG = {
  upstream: [
    'https://dns.google/dns-query',
    'https://cloudflare-dns.com/dns-query',
  ],
  bootstrapDns: ['1.1.1.1:53', '8.8.8.8:53'],
  blocking: {
    blockType: 'zeroIp',
    blockLists: [
      'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    ],
    allowLists: [],
    clientGroupsBlock: { default: ['default'] },
  },
  caching: { minTime: '5m', maxTime: '30m', maxItemsCount: 10000 },
  queryLog: { type: 'csv', target: '/data/blocky/logs', logRetentionDays: 7 },
  prometheus: { enable: true, path: '/metrics' },
  conditional: { mapping: {} },
};

/**
 * Mock the drizzle instance the way BlockyConfigService consumes it:
 * - db.query.blockyConfig.findMany() / findFirst({ where }).prepare()
 * - db.insert(...).values(...).onConflictDoUpdate(...).prepare()
 * The prepared statements expose the mocked execute fns so each test can
 * control what they resolve to.
 */
function createMockDb() {
  const getAllExecute = vi.fn();
  const getByKeyExecute = vi.fn();
  const upsertExecute = vi.fn();

  const db = {
    query: {
      blockyConfig: {
        findMany: vi.fn(() => ({
          prepare: vi.fn(() => ({ execute: getAllExecute })),
        })),
        findFirst: vi.fn(() => ({
          prepare: vi.fn(() => ({ execute: getByKeyExecute })),
        })),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          prepare: vi.fn(() => ({ execute: upsertExecute })),
        })),
      })),
    })),
  };

  return { db, getAllExecute, getByKeyExecute, upsertExecute };
}

function createService() {
  const mocks = createMockDb();
  const service = new BlockyConfigService(mocks.db as unknown as DBType);
  return { ...mocks, service };
}

describe('BlockyConfigService', () => {
  test('getConfig returns the defaults when no config is stored', async () => {
    const { service, getAllExecute } = createService();
    getAllExecute.mockResolvedValue([]);

    const config = await service.getConfig();

    expect(config).toEqual(DEFAULT_CONFIG);
    expect(config.upstream).toContain('https://dns.google/dns-query');
    expect(config.bootstrapDns).toEqual(['1.1.1.1:53', '8.8.8.8:53']);
    expect(config.blocking.blockType).toBe('zeroIp');
    expect(config.caching).toEqual({
      minTime: '5m',
      maxTime: '30m',
      maxItemsCount: 10000,
    });
    expect(config.queryLog).toEqual({
      type: 'csv',
      target: '/data/blocky/logs',
      logRetentionDays: 7,
    });
    expect(config.prometheus).toEqual({ enable: true, path: '/metrics' });
  });

  test('getConfig returns a fresh clone on every call', async () => {
    const { service, getAllExecute } = createService();
    getAllExecute.mockResolvedValue([]);

    const first = await service.getConfig();
    first.blocking.blockType = 'nxdomain';

    const second = await service.getConfig();
    expect(second.blocking.blockType).toBe('zeroIp');
  });

  test('getConfig merges stored JSON over the defaults', async () => {
    const { service, getAllExecute } = createService();
    getAllExecute.mockResolvedValue([
      {
        key: 'config',
        value: JSON.stringify({
          upstream: ['https://custom.example/dns-query'],
          blocking: { blockType: 'nxdomain' },
        }),
      },
    ]);

    const config = await service.getConfig();

    expect(config.upstream).toEqual(['https://custom.example/dns-query']);
    // The merge is shallow: the stored `blocking` object replaces the default
    // one wholesale instead of being deep-merged.
    expect(config.blocking).toEqual({ blockType: 'nxdomain' });
    // Top-level fields not present in the stored config keep their defaults.
    expect(config.caching).toEqual(DEFAULT_CONFIG.caching);
    expect(config.queryLog).toEqual(DEFAULT_CONFIG.queryLog);
    expect(config.prometheus).toEqual(DEFAULT_CONFIG.prometheus);
    expect(config.bootstrapDns).toEqual(DEFAULT_CONFIG.bootstrapDns);
  });

  test('getConfig applies stored configs in order, later entries winning', async () => {
    const { service, getAllExecute } = createService();
    getAllExecute.mockResolvedValue([
      { key: 'a', value: JSON.stringify({ caching: { minTime: '10m' } }) },
      { key: 'b', value: JSON.stringify({ caching: { maxItemsCount: 500 } }) },
    ]);

    const config = await service.getConfig();

    expect(config.caching).toEqual({ maxItemsCount: 500 });
  });

  test('getConfig ignores stored config with invalid JSON', async () => {
    const { service, getAllExecute } = createService();
    getAllExecute.mockResolvedValue([{ key: 'config', value: '{ not json' }]);

    expect(await service.getConfig()).toEqual(DEFAULT_CONFIG);
  });

  test('updateConfig merges partial data over the defaults and persists it', async () => {
    const { service, getAllExecute, upsertExecute } = createService();
    getAllExecute.mockResolvedValue([]);
    upsertExecute.mockResolvedValue(undefined);

    await service.updateConfig({
      upstream: ['https://custom.example/dns-query'],
      prometheus: { enable: false, path: '/metrics' },
    });

    expect(upsertExecute).toHaveBeenCalledTimes(1);
    const [key, value] = upsertExecute.mock.calls[0] as [string, string];
    expect(key).toBe('config');

    const persisted = JSON.parse(value);
    expect(persisted.upstream).toEqual(['https://custom.example/dns-query']);
    // Shallow merge: the partial prometheus object replaces the default one.
    expect(persisted.prometheus).toEqual({ enable: false, path: '/metrics' });
    expect(persisted.blocking).toEqual(DEFAULT_CONFIG.blocking);
    expect(persisted.caching).toEqual(DEFAULT_CONFIG.caching);
    expect(persisted.queryLog).toEqual(DEFAULT_CONFIG.queryLog);
  });

  test('updateConfig merges partial data over the stored config', async () => {
    const { service, getAllExecute, upsertExecute } = createService();
    getAllExecute.mockResolvedValue([
      { key: 'config', value: JSON.stringify({ caching: { minTime: '10m' } }) },
    ]);
    upsertExecute.mockResolvedValue(undefined);

    await service.updateConfig({ caching: { maxItemsCount: 500 } });

    const [key, value] = upsertExecute.mock.calls[0] as [string, string];
    expect(key).toBe('config');
    expect(JSON.parse(value).caching).toEqual({ maxItemsCount: 500 });
  });

  test('resetToDefaults persists the defaults', async () => {
    const { service, getAllExecute, upsertExecute } = createService();
    getAllExecute.mockResolvedValue([]);
    upsertExecute.mockResolvedValue(undefined);

    await service.resetToDefaults();

    expect(upsertExecute).toHaveBeenCalledTimes(1);
    const [key, value] = upsertExecute.mock.calls[0] as [string, string];
    expect(key).toBe('config');
    expect(JSON.parse(value)).toEqual(DEFAULT_CONFIG);
  });

  test('getAll returns every stored config row', async () => {
    const { service, getAllExecute } = createService();
    const rows = [{ key: 'config', value: '{}' }];
    getAllExecute.mockResolvedValue(rows);

    await expect(service.getAll()).resolves.toEqual(rows);
  });

  test('get fetches a config by key', async () => {
    const { service, getByKeyExecute } = createService();
    const row = { key: 'config', value: '{}' };
    getByKeyExecute.mockResolvedValue(row);

    await expect(service.get('config')).resolves.toEqual(row);
    expect(getByKeyExecute).toHaveBeenCalledWith({ key: 'config' });
  });

  test('set upserts a config row', async () => {
    const { service, upsertExecute } = createService();
    upsertExecute.mockResolvedValue(undefined);

    await service.set('config', '{"a":1}');

    expect(upsertExecute).toHaveBeenCalledWith({
      key: 'config',
      value: '{"a":1}',
    });
  });
});

describe('BlockyConfigUpdateSchema', () => {
  test('accepts a valid partial update', () => {
    expect(
      BlockyConfigUpdateSchema.parse({
        upstream: ['https://dns.google/dns-query'],
      })
    ).toEqual({ upstream: ['https://dns.google/dns-query'] });

    expect(
      BlockyConfigUpdateSchema.parse({
        bootstrapDns: ['https://1.1.1.1/dns-query'],
      })
    ).toEqual({ bootstrapDns: ['https://1.1.1.1/dns-query'] });

    expect(
      BlockyConfigUpdateSchema.parse({
        prometheus: { enable: false, path: '/metrics' },
      })
    ).toEqual({ prometheus: { enable: false, path: '/metrics' } });

    expect(
      BlockyConfigUpdateSchema.parse({
        blocking: {
          blockType: 'nxdomain',
          blockLists: ['https://example.com/list'],
          allowLists: [],
          clientGroupsBlock: { default: ['default'] },
        },
      })
    ).toEqual({
      blocking: {
        blockType: 'nxdomain',
        blockLists: ['https://example.com/list'],
        allowLists: [],
        clientGroupsBlock: { default: ['default'] },
      },
    });

    expect(
      BlockyConfigUpdateSchema.parse({
        caching: { minTime: '5m', maxTime: '30m', maxItemsCount: 100 },
      })
    ).toEqual({ caching: { minTime: '5m', maxTime: '30m', maxItemsCount: 100 } });

    expect(
      BlockyConfigUpdateSchema.parse({
        queryLog: {
          type: 'console',
          target: '/data/blocky/logs',
          logRetentionDays: 30,
        },
      })
    ).toEqual({
      queryLog: {
        type: 'console',
        target: '/data/blocky/logs',
        logRetentionDays: 30,
      },
    });

    expect(
      BlockyConfigUpdateSchema.parse({
        conditional: { mapping: {} },
      })
    ).toEqual({ conditional: { mapping: {} } });
  });

  test('accepts bare host and host:port upstream entries', () => {
    expect(
      BlockyConfigUpdateSchema.parse({
        upstream: ['1.1.1.1', 'dns.google', 'dns.google:53'],
      })
    ).toEqual({ upstream: ['1.1.1.1', 'dns.google', 'dns.google:53'] });
  });

  test('accepts scheme-prefixed upstream entries including the DoH defaults', () => {
    expect(
      BlockyConfigUpdateSchema.parse({
        upstream: [
          'https://dns.google/dns-query',
          'https://cloudflare-dns.com/dns-query',
          'udp://1.1.1.1:53',
          'tcp-tls://1.1.1.1:853',
          'tcp+udp://1.1.1.1:53',
          'tls://1.1.1.1:853',
        ],
      })
    ).toEqual({
      upstream: [
        'https://dns.google/dns-query',
        'https://cloudflare-dns.com/dns-query',
        'udp://1.1.1.1:53',
        'tcp-tls://1.1.1.1:853',
        'tcp+udp://1.1.1.1:53',
        'tls://1.1.1.1:853',
      ],
    });
  });

  test('rejects an invalid upstream entry', () => {
    // Contains a space, which no upstream form allows.
    expect(() =>
      BlockyConfigUpdateSchema.parse({ upstream: ['not a dns entry'] })
    ).toThrow();
    // Unsupported scheme.
    expect(() =>
      BlockyConfigUpdateSchema.parse({ upstream: ['ftp://example.com'] })
    ).toThrow();
    // Port with more than five digits.
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        upstream: ['https://dns.google/dns-query', '1.1.1.1:999999'],
      })
    ).toThrow();
  });

  test('accepts the default-style bare host:port bootstrapDns entries', () => {
    expect(
      BlockyConfigUpdateSchema.parse({
        bootstrapDns: ['1.1.1.1:53', '8.8.8.8:53', 'dns.google'],
      })
    ).toEqual({ bootstrapDns: ['1.1.1.1:53', '8.8.8.8:53', 'dns.google'] });
  });

  test('rejects an invalid bootstrapDns entry', () => {
    expect(() =>
      BlockyConfigUpdateSchema.parse({ bootstrapDns: ['not a dns entry'] })
    ).toThrow();
    expect(() =>
      BlockyConfigUpdateSchema.parse({ bootstrapDns: ['1.1.1.1:999999'] })
    ).toThrow();
  });

  test('rejects a partial blocking update', () => {
    // `blocking` is validated as a full object when present: partial updates
    // that omit blockLists/allowLists/clientGroupsBlock are rejected.
    expect(() =>
      BlockyConfigUpdateSchema.parse({ blocking: { blockType: 'nxdomain' } })
    ).toThrow();
  });

  test('rejects an invalid blockType', () => {
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        blocking: {
          blockType: 'invalid',
          blockLists: ['https://example.com/list'],
          allowLists: [],
          clientGroupsBlock: { default: ['default'] },
        },
      })
    ).toThrow();
  });

  test('rejects a malformed blockList or allowList entry', () => {
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        blocking: {
          blockType: 'zeroIp',
          blockLists: ['not-a-url'],
          allowLists: [],
          clientGroupsBlock: { default: ['default'] },
        },
      })
    ).toThrow();

    expect(() =>
      BlockyConfigUpdateSchema.parse({
        blocking: {
          blockType: 'zeroIp',
          blockLists: [],
          allowLists: ['not-a-url'],
          clientGroupsBlock: { default: ['default'] },
        },
      })
    ).toThrow();
  });

  test('rejects a non-positive or non-integer caching maxItemsCount', () => {
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        caching: { minTime: '5m', maxTime: '30m', maxItemsCount: 0 },
      })
    ).toThrow();
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        caching: { minTime: '5m', maxTime: '30m', maxItemsCount: -5 },
      })
    ).toThrow();
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        caching: { minTime: '5m', maxTime: '30m', maxItemsCount: 10.5 },
      })
    ).toThrow();
  });

  test('rejects a non-string or dangerous caching duration', () => {
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        caching: { minTime: 300, maxTime: '30m', maxItemsCount: 10 },
      })
    ).toThrow();
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        caching: { minTime: 'constructor', maxTime: '30m', maxItemsCount: 10 },
      })
    ).toThrow();
  });

  test('rejects an invalid queryLog type', () => {
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        queryLog: { type: 'sqlite', target: '/data', logRetentionDays: 7 },
      })
    ).toThrow();
  });

  test('rejects a non-positive logRetentionDays', () => {
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        queryLog: { type: 'csv', target: '/data', logRetentionDays: 0 },
      })
    ).toThrow();
  });

  test('rejects a dangerous prometheus path', () => {
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        prometheus: { enable: true, path: 'constructor' },
      })
    ).toThrow();
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        prometheus: { enable: true, path: '__proto__' },
      })
    ).toThrow();
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        prometheus: { enable: true, path: 'prototype' },
      })
    ).toThrow();
  });

  test('rejects a dangerous queryLog target', () => {
    expect(() =>
      BlockyConfigUpdateSchema.parse({
        queryLog: { type: 'csv', target: '__proto__', logRetentionDays: 7 },
      })
    ).toThrow();
  });
});

// configToYaml guard tests
vi.mock('#server/utils/Database', () => ({ default: {} }));

import Blocky from '#server/utils/blocky';

describe('configToYaml clientGroupsBlock guard', () => {
  const baseConfig = {
    upstream: ['https://dns.google/dns-query'],
    bootstrapDns: ['1.1.1.1:53'],
    blocking: {
      blockType: 'zeroIp' as const,
      blockLists: ['https://example.com/list.txt'],
      allowLists: [],
      clientGroupsBlock: { default: ['10.0.0.2'], ads: ['10.0.0.3'] },
    },
    caching: { minTime: '5m', maxTime: '30m', maxItemsCount: 10000 },
    queryLog: { type: 'csv' as const, target: '/data/blocky/logs', logRetentionDays: 7 },
    prometheus: { enable: true, path: '/metrics' },
    conditional: { mapping: {} },
  };

  it('emits clientGroupsBlock entries for defined groups', () => {
    const yaml = Blocky.configToYaml(baseConfig);
    expect(yaml).toContain('    default:');
    expect(yaml).toContain('      - 10.0.0.2');
  });

  it('omits clientGroupsBlock groups not defined in denylists/allowlists', () => {
    const yaml = Blocky.configToYaml(baseConfig);
    expect(yaml).not.toContain('    ads:');
    expect(yaml).not.toContain('10.0.0.3');
  });
});
