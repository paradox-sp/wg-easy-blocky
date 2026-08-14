import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// This schema mirrors Blocky's SQLite query log table.
// Blocky creates: CREATE TABLE queries (
//   id INTEGER PRIMARY KEY, timestamp TEXT, client TEXT, type TEXT,
//   domain TEXT, answer TEXT, reason TEXT, duration INTEGER, blocked INTEGER)
// The table lives in Blocky's own SQLite database, NOT in wg-easy's DB.
// Do NOT export this schema from the main database/schema.ts, or drizzle-kit
// would try to create the table in wg-easy's own database.
export const dnsQuery = sqliteTable(
  'queries',
  {
    id: int().primaryKey({ autoIncrement: true }),
    timestamp: text('timestamp').notNull(),
    client: text('client').notNull(),
    type: text('type').notNull(),
    domain: text('domain').notNull(),
    answer: text('answer'),
    reason: text('reason'),
    duration: int('duration'),
    blocked: int({ mode: 'boolean' }).notNull(),
  },
  (table) => [
    index('idx_timestamp').on(table.timestamp),
    index('idx_client').on(table.client),
    index('idx_domain').on(table.domain),
    index('idx_blocked').on(table.blocked),
  ]
);

export const dnsQueryRelations = {};
