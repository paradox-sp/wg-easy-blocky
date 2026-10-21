import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { createDebug } from 'obug';

import type {
  DnsHistoryQueryInput,
  DnsHistoryResponse,
  DnsQueryPublic,
} from './types';

import { BLOCKY_ENV } from '#server/utils/config';
import Database from '#server/utils/Database';

const DNS_DEBUG = createDebug('DNSHistory');

/**
 * Blocky v0.25 writes its query log as tab-separated CSV files
 * (`YYYY-MM-DD_<prefix>.log`) using Go's encoding/csv with Comma='\t'.
 * There is no header row and exactly 11 columns, in fixed order:
 *   0 Start, 1 ClientIP, 2 ClientNames, 3 DurationMs, 4 ResponseReason,
 *   5 QuestionName, 6 Answer, 7 ResponseCode, 8 ResponseType,
 *   9 QuestionType, 10 BlockyInstance
 * Empty columns mean "not logged" (fields keep-list) and should be treated
 * as null/absent. A query is blocked when ResponseType === 'BLOCKED'.
 */
const COLUMN_COUNT = 11;
const DNS_HISTORY_CACHE_IDLE_MS = 5 * 60 * 1_000;

/**
 * Minimal RFC 4180-aware parser for a tab-delimited CSV document.
 *
 * Go's encoding/csv double-quotes any field containing a tab, newline or
 * quote (with `""` escaping), so a naive split on '\t' is not safe. This
 * state machine handles quoted fields (including embedded tabs/newlines and
 * escaped quotes), unquoted fields, and LF/CRLF line endings.
 */
function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const flushField = () => {
    row.push(field);
    field = '';
  };

  const flushRow = () => {
    flushField();
    // Skip completely empty lines (e.g. a trailing newline at EOF).
    if (!(row.length === 1 && row[0] === '')) {
      rows.push(row);
    }
    row = [];
  };

  let i = 0;
  while (i < content.length) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      i += 1;
    } else if (ch === '\t') {
      flushField();
      i += 1;
    } else if (ch === '\n') {
      flushRow();
      i += 1;
    } else if (ch === '\r') {
      // Strip CR so CRLF files parse cleanly.
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }

  if (field.length > 0 || row.length > 0) {
    flushRow();
  }

  return rows;
}

function parseLogRows(content: string): string[][] {
  const rows = parseCsvRows(content);
  let validRows = 0;
  for (const row of rows) {
    if (row.length >= COLUMN_COUNT) {
      rows[validRows] = row;
      validRows += 1;
    }
  }
  rows.length = validRows;
  return rows;
}

interface LogFileState {
  path: string;
  signature: string;
}

interface ParsedLogFile {
  signature: string;
  rows: string[][];
}

class DnsQueryService {
  /**
   * Keep parsed rows per log file so an append to today's active file does not
   * re-read every retained historical file. The aggregate cache avoids
   * rebuilding the combined row list while the directory signature is stable.
   * Replacing the map after each successful scan also releases deleted files.
   */
  #fileCache = new Map<string, ParsedLogFile>();
  #cacheSignature: string | null = null;
  #cacheRows: string[][] = [];
  #cacheLoad: Promise<string[][]> | null = null;
  #cacheExpiryTimer: NodeJS.Timeout | undefined;

  #clearCache(): void {
    clearTimeout(this.#cacheExpiryTimer);
    this.#cacheExpiryTimer = undefined;
    this.#fileCache.clear();
    this.#cacheSignature = null;
    this.#cacheRows = [];
  }

  #scheduleCacheExpiry(): void {
    clearTimeout(this.#cacheExpiryTimer);
    this.#cacheExpiryTimer = setTimeout(() => {
      this.#cacheExpiryTimer = undefined;
      this.#fileCache.clear();
      this.#cacheSignature = null;
      this.#cacheRows = [];
    }, DNS_HISTORY_CACHE_IDLE_MS);
    this.#cacheExpiryTimer.unref();
  }

  /**
   * Resolve the Blocky query log directory at call time so tests can mock
   * `#server/utils/config`. Returns null when the integration is disabled or
   * the directory is missing/unreadable (Blocky falls back to the console
   * writer when it cannot create the target directory, so no logs exist).
   */
  #getLogDir(): string | null {
    if (!BLOCKY_ENV.ENABLED) {
      DNS_DEBUG('Blocky not enabled');
      return null;
    }

    const dir = BLOCKY_ENV.LOG_DIR;
    if (!dir) {
      DNS_DEBUG('Blocky query log directory not configured');
      return null;
    }

    if (!existsSync(dir)) {
      DNS_DEBUG(`Blocky query log directory missing: ${dir}`);
      return null;
    }

    return dir;
  }

  /**
   * Scan every `*.log` file and parse only files whose metadata changed,
   * reusing the aggregate rows while the directory state is unchanged.
   * Never throws: any failure degrades to an empty row list.
   */
  async #readLogRows(): Promise<string[][]> {
    if (this.#cacheLoad) {
      return this.#cacheLoad;
    }

    const load = this.#loadLogRows();
    this.#cacheLoad = load;
    try {
      const rows = await load;
      if (this.#cacheSignature !== null) {
        this.#scheduleCacheExpiry();
      }
      return rows;
    } finally {
      if (this.#cacheLoad === load) {
        this.#cacheLoad = null;
      }
    }
  }

  async #loadLogRows(): Promise<string[][]> {
    const dir = this.#getLogDir();
    if (!dir) {
      this.#clearCache();
      return [];
    }

    try {
      const { signature, files } = await this.#scanLogFiles(dir);
      if (signature === this.#cacheSignature) {
        return this.#cacheRows;
      }

      const rows: string[][] = [];
      const nextFileCache = new Map<string, ParsedLogFile>();
      for (const file of files) {
        const cached = this.#fileCache.get(file.path);
        const fileRows =
          cached?.signature === file.signature
            ? cached.rows
            : parseLogRows(await readFile(file.path, 'utf8'));

        nextFileCache.set(file.path, {
          signature: file.signature,
          rows: fileRows,
        });
        for (const row of fileRows) {
          rows.push(row);
        }
      }

      this.#fileCache = nextFileCache;
      this.#cacheSignature = signature;
      this.#cacheRows = rows;
      return rows;
    } catch (error) {
      // Any fs failure: drop the cache so a later successful read is not
      // shadowed by stale rows, then degrade to empty.
      this.#clearCache();
      DNS_DEBUG('Failed to read Blocky query logs:', error);
      return [];
    }
  }

  /**
   * Build a cheap signature of the log directory state without reading file
   * contents. Each file carries its own signature so unchanged parsed files
   * can be reused when another file changes.
   */
  async #scanLogFiles(
    dir: string
  ): Promise<{ signature: string; files: LogFileState[] }> {
    const entries = await readdir(dir);
    const names = entries.filter((name) => name.endsWith('.log')).sort();

    const files = await Promise.all(
      names.map(async (name) => {
        const path = join(dir, name);
        const fileStat = await stat(path);
        return {
          path,
          signature: `${name}:${fileStat.size}:${fileStat.mtimeMs}`,
        };
      })
    );

    return {
      signature: `${dir}\0${files.map((file) => file.signature).join('|')}`,
      files,
    };
  }

  /**
   * Load every wg-easy client once and build an IP -> friendly name lookup
   * covering both the tunnel IPv4 and IPv6 addresses, so history rows can be
   * enriched with the alias configured on the VPN setup page. Never throws:
   * any repository failure degrades to an empty map and queries keep showing
   * the client IP only.
   */
  async #loadClientNameMap(): Promise<Map<string, string>> {
    const ipToName = new Map<string, string>();
    try {
      const clients = await Database.clients.getAllPublic({});
      for (const { name, ipv4Address, ipv6Address } of clients) {
        if (ipv4Address) ipToName.set(ipv4Address, name);
        if (ipv6Address) ipToName.set(ipv6Address, name);
      }
    } catch (error) {
      DNS_DEBUG('Failed to load client names for DNS history:', error);
    }
    return ipToName;
  }

  async getHistory(query: DnsHistoryQueryInput): Promise<DnsHistoryResponse> {
    const rows = await this.#readLogRows();

    // Resolve friendly client names from the wg-easy client repository once
    // per request, AFTER the cached parse: the row cache stays pure (it holds
    // raw CSV rows only) and enrichment always reflects the current VPN
    // clients without ever changing the cache signature.
    const ipToName = await this.#loadClientNameMap();
    const filter = query.filter?.trim()
      ? query.filter.toLowerCase()
      : undefined;
    const client = query.client?.trim() ? query.client : undefined;
    const domain = query.domain?.trim()
      ? query.domain.toLowerCase()
      : undefined;
    const start = query.startDate ? new Date(query.startDate) : null;
    const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
    const end = query.endDate ? new Date(query.endDate) : null;
    const validEnd = end && !Number.isNaN(end.getTime()) ? end : null;

    // Apply every filter while converting rows. This avoids allocating a new
    // full-size array for each active filter on large DNS histories.
    const queries: DnsQueryPublic[] = [];
    let id = 0;
    for (const row of rows) {
      const item = this.#rowToQuery(row, id, ipToName);
      if (!item) continue;
      id += 1;

      if (
        filter &&
        !item.client.toLowerCase().includes(filter) &&
        !item.domain.toLowerCase().includes(filter) &&
        !(item.answer ?? '').toLowerCase().includes(filter) &&
        !(item.reason ?? '').toLowerCase().includes(filter)
      ) {
        continue;
      }
      if (client && item.client !== client) continue;
      if (domain && !item.domain.toLowerCase().includes(domain)) continue;
      if (query.blocked !== undefined && item.blocked !== query.blocked) {
        continue;
      }
      if (validStart && item.timestamp < validStart) continue;
      if (validEnd && item.timestamp > validEnd) continue;
      queries.push(item);
    }

    queries.sort((a, b) =>
      query.sort === 'asc'
        ? a.timestamp.getTime() - b.timestamp.getTime()
        : b.timestamp.getTime() - a.timestamp.getTime()
    );

    const total = queries.length;
    const page = queries.slice(query.offset, query.offset + query.limit);

    return {
      queries: page,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getClients(): Promise<string[]> {
    const rows = await this.#readLogRows();
    const clients = new Set<string>();

    for (const row of rows) {
      const client = row[1];
      if (client) clients.add(client);
    }

    return [...clients].sort();
  }

  async getStats(): Promise<{
    totalQueries: number;
    blockedQueries: number;
    allowedQueries: number;
    uniqueClients: number;
    uniqueDomains: number;
  }> {
    const rows = await this.#readLogRows();

    const clients = new Set<string>();
    const domains = new Set<string>();
    let totalQueries = 0;
    let blockedQueries = 0;

    for (const row of rows) {
      const client = row[1];
      const domain = row[5];
      if (client) clients.add(client);
      if (domain) domains.add(domain);
      totalQueries += 1;
      if (row[8] === 'BLOCKED') blockedQueries += 1;
    }

    return {
      totalQueries,
      blockedQueries,
      allowedQueries: totalQueries - blockedQueries,
      uniqueClients: clients.size,
      uniqueDomains: domains.size,
    };
  }

  #rowToQuery(
    row: string[],
    id: number,
    ipToName: Map<string, string>
  ): DnsQueryPublic | null {
    const timestampStr = row[0];
    const client = row[1];
    const domain = row[5];

    // Skip malformed rows missing required fields.
    if (!timestampStr || !client || !domain) return null;

    const timestamp = new Date(timestampStr);
    if (Number.isNaN(timestamp.getTime())) return null;

    const durationStr = row[3];
    const duration = durationStr ? Number(durationStr) : null;

    return {
      id,
      timestamp,
      client,
      clientName: ipToName.get(client) ?? null,
      type: row[9] ?? '',
      domain,
      answer: row[6] || null,
      reason: row[4] || null,
      duration: duration !== null && !Number.isNaN(duration) ? duration : null,
      blocked: row[8] === 'BLOCKED',
    };
  }
}

export default new DnsQueryService();
