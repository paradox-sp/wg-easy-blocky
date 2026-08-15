import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createDebug } from 'obug';

import { BLOCKY_ENV } from '#server/utils/config';
import Database from '#server/utils/Database';
import type {
  DnsHistoryQueryInput,
  DnsHistoryResponse,
  DnsQueryPublic,
} from './types';

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

class DnsQueryService {
  /**
   * Parse cache keyed by a cheap signature of the log directory state
   * (`name:size:mtimeMs` per file). Blocky appends to today's file
   * continuously, so the signature changes as soon as new rows are written
   * and the cache self-invalidates naturally — no TTL required.
   */
  #cacheSignature: string | null = null;
  #cacheRows: string[][] = [];

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
   * Read and parse every `*.log` file in the Blocky query log directory,
   * reusing a cached parse when the directory state is unchanged.
   * Never throws: any failure degrades to an empty row list.
   */
  async #readLogRows(): Promise<string[][]> {
    const dir = this.#getLogDir();
    if (!dir) return [];

    try {
      const { signature, files } = await this.#scanLogFiles(dir);
      if (signature === this.#cacheSignature) {
        return this.#cacheRows;
      }

      const rows: string[][] = [];
      for (const file of files) {
        const content = await readFile(join(dir, file), 'utf8');
        for (const row of parseCsvRows(content)) {
          if (row.length >= COLUMN_COUNT) {
            rows.push(row);
          }
        }
      }

      this.#cacheSignature = signature;
      this.#cacheRows = rows;
      return rows;
    } catch (error) {
      // Any fs failure: drop the cache so a later successful read is not
      // shadowed by stale rows, then degrade to empty.
      this.#cacheSignature = null;
      this.#cacheRows = [];
      DNS_DEBUG('Failed to read Blocky query logs:', error);
      return [];
    }
  }

  /**
   * Build a cheap signature of the log directory state without reading file
   * contents: the sorted `*.log` names plus each file's size and mtime.
   * Returns the signature and the sorted file list (reused on a cache miss).
   */
  async #scanLogFiles(
    dir: string
  ): Promise<{ signature: string; files: string[] }> {
    const entries = await readdir(dir);
    const files = entries.filter((name) => name.endsWith('.log')).sort();

    const parts: string[] = [];
    for (const file of files) {
      const s = await stat(join(dir, file));
      parts.push(`${file}:${s.size}:${s.mtimeMs}`);
    }

    return { signature: parts.join('|'), files };
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

  async getHistory(
    query: DnsHistoryQueryInput
  ): Promise<DnsHistoryResponse> {
    const rows = await this.#readLogRows();

    // Resolve friendly client names from the wg-easy client repository once
    // per request, AFTER the cached parse: the row cache stays pure (it holds
    // raw CSV rows only) and enrichment always reflects the current VPN
    // clients without ever changing the cache signature.
    const ipToName = await this.#loadClientNameMap();

    let queries: DnsQueryPublic[] = [];
    let id = 0;
    for (const row of rows) {
      const item = this.#rowToQuery(row, id, ipToName);
      if (item) {
        queries.push(item);
        id += 1;
      }
    }

    if (query.filter?.trim()) {
      const filter = query.filter.toLowerCase();
      queries = queries.filter(
        (q) =>
          q.client.toLowerCase().includes(filter) ||
          q.domain.toLowerCase().includes(filter) ||
          (q.answer ?? '').toLowerCase().includes(filter) ||
          (q.reason ?? '').toLowerCase().includes(filter)
      );
    }

    if (query.client?.trim()) {
      queries = queries.filter((q) => q.client === query.client);
    }

    if (query.domain?.trim()) {
      const domain = query.domain.toLowerCase();
      queries = queries.filter((q) => q.domain.toLowerCase().includes(domain));
    }

    if (query.blocked !== undefined) {
      queries = queries.filter((q) => q.blocked === query.blocked);
    }

    if (query.startDate) {
      const start = new Date(query.startDate);
      if (!Number.isNaN(start.getTime())) {
        queries = queries.filter((q) => q.timestamp >= start);
      }
    }

    if (query.endDate) {
      const end = new Date(query.endDate);
      if (!Number.isNaN(end.getTime())) {
        queries = queries.filter((q) => q.timestamp <= end);
      }
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
      type: row[9],
      domain,
      answer: row[6] || null,
      reason: row[4] || null,
      duration: duration !== null && !Number.isNaN(duration) ? duration : null,
      blocked: row[8] === 'BLOCKED',
    };
  }
}

export default new DnsQueryService();