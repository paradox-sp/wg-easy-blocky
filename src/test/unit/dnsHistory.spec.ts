import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Stats } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';

import DnsQueryService from '#server/database/repositories/dnsQuery/service';
import { DnsHistoryQuerySchema } from '#server/database/repositories/dnsQuery/types';

// The CSV reader reads BLOCKY_ENV.LOG_DIR at call time, so mocking the config
// module lets us control the log directory and exercise the degradation paths
// deterministically.
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

// Keep the (still in-place) SQLite client mocked so the spec never touches a
// real database while the CSV reader rewrite lands. The CSV reader itself does
// not use @libsql/client, so this mock becomes inert once the rewrite is in.
vi.mock('@libsql/client', () => ({
  createClient: vi.fn(() => ({
    execute: vi.fn().mockRejectedValue(
      new Error('unable to open database file')
    ),
  })),
}));

// getHistory resolves friendly client names from the wg-easy client
// repository (the Database singleton) per request. Mock the module so the
// name map is controllable per-test and the real SQLite-backed service is
// never constructed.
const mockClientsRepo = vi.hoisted(() => ({
  getAllPublic: vi.fn(),
}));

vi.mock('#server/utils/Database', () => ({
  default: {
    clients: {
      getAllPublic: mockClientsRepo.getAllPublic,
    },
  },
}));

// The service checks the log directory exists before reading it. Mock it so
// the fs/promises mocks below are exercised deterministically regardless of
// the host environment.
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
}));

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
}));

const readdirMock = vi.mocked(readdir);
const readFileMock = vi.mocked(readFile);
const statMock = vi.mocked(stat);

const LOG_DIR = '/data/blocky/logs';

// Blocky CSV query log rows: tab-separated, 11 columns, no header:
// Start, ClientIP, ClientNames, DurationMs, ResponseReason, QuestionName,
// Answer, ResponseCode, ResponseType, QuestionType, BlockyInstance
const ROW_ALLOWED = [
  '2026-08-14 10:00:00',
  '10.8.0.2',
  'phone',
  '12',
  'NOERROR',
  'example.com',
  '93.184.216.34',
  'NOERROR',
  'RESOLVED',
  'A',
  'blocky-1',
].join('\t');

const ROW_ALLOWED_EMPTY_REASON = [
  '2026-08-14 10:00:05',
  '10.8.0.3',
  'laptop',
  '8',
  '', // empty ResponseReason
  'ads.example.org',
  '', // empty Answer
  'NOERROR',
  'RESOLVED',
  'A',
  'blocky-1',
].join('\t');

const ROW_BLOCKED = [
  '2026-08-14 10:00:10',
  '10.8.0.2',
  'phone',
  '3',
  'BLOCKED (ads: bad.example.com)',
  'bad.example.com',
  '',
  'NOERROR',
  'BLOCKED',
  'A',
  'blocky-1',
].join('\t');

const ROW_API = [
  '2026-08-14 10:00:15',
  '10.8.0.4',
  'desktop',
  '5',
  'NOERROR',
  'api.example.com',
  '10.0.0.1',
  'NOERROR',
  'RESOLVED',
  'AAAA',
  'blocky-1',
].join('\t');

const ROW_MAIL = [
  '2026-08-14 10:00:20',
  '10.8.0.2',
  'phone',
  '2',
  'NOERROR',
  'mail.example.com',
  '10.0.0.2',
  'NOERROR',
  'RESOLVED',
  'MX',
  'blocky-1',
].join('\t');

const DEFAULT_FILES = {
  'blocky.log': [
    ROW_ALLOWED,
    ROW_ALLOWED_EMPTY_REASON,
    ROW_BLOCKED,
    ROW_API,
    ROW_MAIL,
  ].join('\n'),
};

function mockLogFiles(files: Record<string, string>) {
  readdirMock.mockResolvedValue(Object.keys(files));
  readFileMock.mockImplementation(async (filePath) => {
    const name = String(filePath).split(/[\\/]/).pop() ?? '';
    if (name in files) return files[name]!;
    throw new Error(`ENOENT: no such file ${String(filePath)}`);
  });
  // The parse cache keys on name:size:mtimeMs, so stat must reflect the file
  // content (size) for the cache to invalidate when fixtures change.
  statMock.mockImplementation(async (filePath) => {
    const name = String(filePath).split(/[\\/]/).pop() ?? '';
    const content = files[name];
    if (content === undefined) {
      throw new Error(`ENOENT: no such file ${String(filePath)}`);
    }
    return { size: content.length, mtimeMs: 0 } as unknown as Stats;
  });
}

const EMPTY_STATS = {
  totalQueries: 0,
  blockedQueries: 0,
  allowedQueries: 0,
  uniqueClients: 0,
  uniqueDomains: 0,
};

beforeEach(() => {
  readdirMock.mockReset();
  readFileMock.mockReset();
  statMock.mockReset();
  mockClientsRepo.getAllPublic.mockReset();
  mockClientsRepo.getAllPublic.mockResolvedValue([]);
  mockBlockyEnv.ENABLED = true;
  mockBlockyEnv.LOG_DIR = LOG_DIR;
});

describe('DnsQueryService CSV query log reader', () => {
  test('maps the 11 tab-separated columns onto a query record', async () => {
    mockLogFiles({ 'blocky.log': ROW_ALLOWED });

    const result = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });

    expect(result.total).toBe(1);
    const q = result.queries[0];
    expect(q?.client).toBe('10.8.0.2'); // ClientIP
    expect(q?.domain).toBe('example.com'); // QuestionName
    expect(q?.answer).toBe('93.184.216.34'); // Answer
    expect(q?.reason).toBe('NOERROR'); // ResponseReason
    expect(q?.type).toBe('A'); // QuestionType
    expect(q?.duration).toBe(12); // DurationMs
    expect(q?.blocked).toBe(false);
    expect(q?.timestamp).toBeInstanceOf(Date);
    expect(readdirMock).toHaveBeenCalledWith(LOG_DIR);
  });

  test('detects blocked rows from the ResponseType column', async () => {
    mockLogFiles({
      'blocky.log': [ROW_ALLOWED, ROW_ALLOWED_EMPTY_REASON, ROW_BLOCKED].join(
        '\n'
      ),
    });

    const result = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'asc',
    });

    expect(result.total).toBe(3);
    expect(result.queries.map((q) => q.blocked)).toEqual([
      false,
      false,
      true,
    ]);
    const blocked = result.queries.find((q) => q.blocked);
    expect(blocked?.domain).toBe('bad.example.com');
    expect(blocked?.reason).toBe('BLOCKED (ads: bad.example.com)');
  });

  test('does not treat an allowed row with an empty ResponseReason as blocked', async () => {
    mockLogFiles({ 'blocky.log': ROW_ALLOWED_EMPTY_REASON });

    const result = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });

    expect(result.total).toBe(1);
    expect(result.queries[0]?.blocked).toBe(false);
    expect(result.queries[0]?.domain).toBe('ads.example.org');
    expect(result.queries[0]?.reason).toBeFalsy();
  });

  test('sorts by start time descending by default and ascending on request', async () => {
    mockLogFiles(DEFAULT_FILES);

    const desc = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(desc.queries[0]?.domain).toBe('mail.example.com');
    expect(desc.queries[desc.queries.length - 1]?.domain).toBe('example.com');

    const asc = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'asc',
    });
    expect(asc.queries[0]?.domain).toBe('example.com');
    expect(asc.queries[asc.queries.length - 1]?.domain).toBe(
      'mail.example.com'
    );
  });

  test('paginates with limit and offset while reporting the total', async () => {
    mockLogFiles(DEFAULT_FILES);

    const result = await DnsQueryService.getHistory({
      limit: 2,
      offset: 1,
      sort: 'desc',
    });

    expect(result.total).toBe(5);
    expect(result.limit).toBe(2);
    expect(result.offset).toBe(1);
    expect(result.queries).toHaveLength(2);
    // Descending order: mail, api, bad, ads, example -> offset 1 starts at api.
    expect(result.queries[0]?.domain).toBe('api.example.com');
    expect(result.queries[1]?.domain).toBe('bad.example.com');
  });

  test('filters by free text across client, domain, answer, and reason', async () => {
    mockLogFiles(DEFAULT_FILES);

    const byDomain = await DnsQueryService.getHistory({
      filter: 'api',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(byDomain.total).toBe(1);
    expect(byDomain.queries[0]?.domain).toBe('api.example.com');

    // Case-insensitive, mirroring the LOWER() search of the SQLite reader.
    const byDomainUpper = await DnsQueryService.getHistory({
      filter: 'API',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(byDomainUpper.total).toBe(1);

    // Matches the client IP column (rows 1, 3, 5).
    const byClient = await DnsQueryService.getHistory({
      filter: '10.8.0.2',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(byClient.total).toBe(3);

    // Matches the answer column.
    const byAnswer = await DnsQueryService.getHistory({
      filter: '93.184',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(byAnswer.total).toBe(1);

    // Matches the reason column (rows 1, 4, 5).
    const byReason = await DnsQueryService.getHistory({
      filter: 'NOERROR',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(byReason.total).toBe(3);
  });

  test('filters by exact client, domain substring, and blocked flag', async () => {
    mockLogFiles(DEFAULT_FILES);

    const byClient = await DnsQueryService.getHistory({
      client: '10.8.0.2',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(byClient.total).toBe(3);

    const byDomain = await DnsQueryService.getHistory({
      domain: 'example.com',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(byDomain.total).toBe(4);

    const blockedTrue = await DnsQueryService.getHistory({
      blocked: true,
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(blockedTrue.total).toBe(1);
    expect(blockedTrue.queries[0]?.domain).toBe('bad.example.com');

    const blockedFalse = await DnsQueryService.getHistory({
      blocked: false,
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(blockedFalse.total).toBe(4);
  });

  test('filters by startDate and endDate', async () => {
    mockLogFiles(DEFAULT_FILES);

    const from = await DnsQueryService.getHistory({
      startDate: '2026-08-14 10:00:10',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(from.total).toBe(3);

    const until = await DnsQueryService.getHistory({
      endDate: '2026-08-14 10:00:10',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(until.total).toBe(3);

    const range = await DnsQueryService.getHistory({
      startDate: '2026-08-14 10:00:05',
      endDate: '2026-08-14 10:00:15',
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(range.total).toBe(3);
  });

  test('returns distinct client IPs sorted ascending', async () => {
    mockLogFiles(DEFAULT_FILES);

    await expect(DnsQueryService.getClients()).resolves.toEqual([
      '10.8.0.2',
      '10.8.0.3',
      '10.8.0.4',
    ]);
  });

  test('computes stats over the log files', async () => {
    mockLogFiles(DEFAULT_FILES);

    await expect(DnsQueryService.getStats()).resolves.toEqual({
      totalQueries: 5,
      blockedQueries: 1,
      allowedQueries: 4,
      uniqueClients: 3,
      uniqueDomains: 5,
    });
  });

  test('reads every *.log file and skips non-log entries', async () => {
    mockLogFiles({
      'a.log': ROW_ALLOWED,
      'b.log': ROW_BLOCKED,
      'readme.txt': 'ignore me',
    });

    const result = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });

    expect(result.total).toBe(2);
    // Only the .log files are read; readme.txt is never opened.
    expect(readFileMock).toHaveBeenCalledTimes(2);
    expect(
      readFileMock.mock.calls.every(([path]) => !String(path).endsWith('readme.txt'))
    ).toBe(true);
  });

  test('caches parsed rows and re-reads when the log files change', async () => {
    // Unique filename so the singleton's cache is guaranteed cold for this test.
    mockLogFiles({ 'cache.log': ROW_ALLOWED });

    const first = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(first.total).toBe(1);
    expect(readFileMock).toHaveBeenCalledTimes(1);

    // Unchanged directory state -> the second call hits the cache.
    const second = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(second.total).toBe(1);
    expect(readFileMock).toHaveBeenCalledTimes(1);

    // Blocky appends a row: the file's size changes, so the signature changes
    // and the next call re-reads.
    const changed = { 'cache.log': [ROW_ALLOWED, ROW_BLOCKED].join('\n') };
    readdirMock.mockResolvedValue(Object.keys(changed));
    readFileMock.mockImplementation(async (filePath) => {
      const name = String(filePath).split(/[\\/]/).pop() ?? '';
      if (name in changed) return changed[name]!;
      throw new Error(`ENOENT: no such file ${String(filePath)}`);
    });
    statMock.mockImplementation(async (filePath) => {
      const name = String(filePath).split(/[\\/]/).pop() ?? '';
      const content = changed[name];
      if (content === undefined) {
        throw new Error(`ENOENT: no such file ${String(filePath)}`);
      }
      return { size: content.length, mtimeMs: 0 } as unknown as Stats;
    });

    const third = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(third.total).toBe(2);
    expect(readFileMock).toHaveBeenCalledTimes(2);
  });

  test('resolves the friendly client name for a matching tunnel IP', async () => {
    mockLogFiles({ 'blocky.log': ROW_ALLOWED }); // client IP 10.8.0.2
    mockClientsRepo.getAllPublic.mockResolvedValue([
      {
        name: 'My Phone',
        ipv4Address: '10.8.0.2',
        ipv6Address: 'fd00:0000:0000:0000:0000:0000:0000:0002',
      },
    ]);

    const result = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });

    expect(result.total).toBe(1);
    expect(result.queries[0]?.client).toBe('10.8.0.2'); // IP stays primary
    expect(result.queries[0]?.clientName).toBe('My Phone');
  });

  test('resolves names for both IPv4 and IPv6 tunnel addresses', async () => {
    // ROW_API uses client IP 10.8.0.4; ROW_V6 uses a tunnel IPv6 address.
    const ROW_V6 = [
      '2026-08-14 10:00:30',
      'fd00::2',
      'phone-v6',
      '4',
      'NOERROR',
      'v6.example.com',
      '::1',
      'NOERROR',
      'RESOLVED',
      'AAAA',
      'blocky-1',
    ].join('\t');

    mockLogFiles({ 'blocky.log': [ROW_API, ROW_V6].join('\n') });
    mockClientsRepo.getAllPublic.mockResolvedValue([
      { name: 'Desktop', ipv4Address: '10.8.0.4', ipv6Address: 'fd00::4' },
      { name: 'My Phone', ipv4Address: '10.8.0.2', ipv6Address: 'fd00::2' },
    ]);

    const result = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });

    // Descending by timestamp: ROW_V6 (10:00:30) first, then ROW_API.
    expect(result.queries[0]?.client).toBe('fd00::2');
    expect(result.queries[0]?.clientName).toBe('My Phone');
    expect(result.queries[1]?.client).toBe('10.8.0.4');
    expect(result.queries[1]?.clientName).toBe('Desktop');
  });

  test('leaves clientName null for unknown IPs and when the client repo fails', async () => {
    mockLogFiles({ 'blocky.log': ROW_ALLOWED }); // client IP 10.8.0.2
    mockClientsRepo.getAllPublic.mockResolvedValue([
      { name: 'Other', ipv4Address: '10.8.0.9', ipv6Address: 'fd00::9' },
    ]);

    const noMatch = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(noMatch.total).toBe(1);
    expect(noMatch.queries[0]?.clientName).toBeNull();

    // A failing client repository must never break history loading.
    mockClientsRepo.getAllPublic.mockRejectedValue(
      new Error('db unavailable')
    );
    const degraded = await DnsQueryService.getHistory({
      limit: 100,
      offset: 0,
      sort: 'desc',
    });
    expect(degraded.total).toBe(1);
    expect(degraded.queries[0]?.clientName).toBeNull();
  });

  test('degrades gracefully when the log directory cannot be read', async () => {
    readdirMock.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    await expect(
      DnsQueryService.getHistory({ limit: 50, offset: 10, sort: 'desc' })
    ).resolves.toEqual({ queries: [], total: 0, limit: 50, offset: 10 });
    await expect(DnsQueryService.getStats()).resolves.toEqual(EMPTY_STATS);
    await expect(DnsQueryService.getClients()).resolves.toEqual([]);
  });

  test('degrades gracefully when the log directory is empty', async () => {
    readdirMock.mockResolvedValue([]);

    await expect(
      DnsQueryService.getHistory({ limit: 50, offset: 10, sort: 'desc' })
    ).resolves.toEqual({ queries: [], total: 0, limit: 50, offset: 10 });
    await expect(DnsQueryService.getStats()).resolves.toEqual(EMPTY_STATS);
    await expect(DnsQueryService.getClients()).resolves.toEqual([]);
  });

  test('degrades gracefully when a log file cannot be read', async () => {
    readdirMock.mockResolvedValue(['blocky.log']);
    statMock.mockResolvedValue({ size: 100, mtimeMs: 0 } as unknown as Stats);
    readFileMock.mockRejectedValue(new Error('EACCES: permission denied'));

    await expect(
      DnsQueryService.getHistory({ limit: 25, offset: 0, sort: 'desc' })
    ).resolves.toEqual({ queries: [], total: 0, limit: 25, offset: 0 });
    await expect(DnsQueryService.getStats()).resolves.toEqual(EMPTY_STATS);
  });

  test('returns empty results when the Blocky integration is disabled', async () => {
    mockBlockyEnv.ENABLED = false;

    await expect(
      DnsQueryService.getHistory({ limit: 25, offset: 0, sort: 'desc' })
    ).resolves.toEqual({ queries: [], total: 0, limit: 25, offset: 0 });
    await expect(DnsQueryService.getStats()).resolves.toEqual(EMPTY_STATS);
    await expect(DnsQueryService.getClients()).resolves.toEqual([]);
    // Disabled short-circuits before touching the file system.
    expect(readdirMock).not.toHaveBeenCalled();
  });
});

describe('DnsHistoryQuerySchema', () => {
  test('coerces string limit and offset to numbers and applies defaults', () => {
    // The transform on `blocked` keeps an absent value undefined so the
    // service can distinguish "not filtered" from "allowed" — it is NOT
    // defaulted to false.
    expect(DnsHistoryQuerySchema.parse({})).toEqual({
      limit: 100,
      offset: 0,
      sort: 'desc',
      blocked: undefined,
    });

    expect(
      DnsHistoryQuerySchema.parse({ limit: '50', offset: '10', sort: 'asc' })
    ).toEqual({
      limit: 50,
      offset: 10,
      sort: 'asc',
      blocked: undefined,
    });
  });

  test('parses the blocked flag from a string', () => {
    expect(DnsHistoryQuerySchema.parse({ blocked: 'true' }).blocked).toBe(true);
    expect(DnsHistoryQuerySchema.parse({ blocked: 'false' }).blocked).toBe(
      false
    );
    expect(DnsHistoryQuerySchema.parse({}).blocked).toBeUndefined();
  });

  test('rejects an invalid blocked value', () => {
    expect(() => DnsHistoryQuerySchema.parse({ blocked: 'yes' })).toThrow();
  });

  test('rejects an out-of-range limit', () => {
    expect(() => DnsHistoryQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => DnsHistoryQuerySchema.parse({ limit: 1001 })).toThrow();
    expect(() => DnsHistoryQuerySchema.parse({ limit: 1.5 })).toThrow();
    // String inputs are coerced first, then validated against the range.
    expect(() => DnsHistoryQuerySchema.parse({ limit: '0' })).toThrow();
  });

  test('rejects a negative offset', () => {
    expect(() => DnsHistoryQuerySchema.parse({ offset: -1 })).toThrow();
    expect(() => DnsHistoryQuerySchema.parse({ offset: '-5' })).toThrow();
  });

  test('rejects an invalid sort direction', () => {
    expect(() => DnsHistoryQuerySchema.parse({ sort: 'up' })).toThrow();
  });
});
