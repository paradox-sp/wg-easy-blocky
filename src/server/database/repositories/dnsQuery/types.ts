import type { InferSelectModel } from 'drizzle-orm';
import z from 'zod';

import { dnsQuery } from './schema';

export type DnsQueryType = InferSelectModel<typeof dnsQuery>;

export interface DnsQueryPublic {
  id: number;
  timestamp: Date;
  client: string;
  /** Friendly wg-easy client name for the client IP, when a match exists. */
  clientName?: string | null;
  type: string;
  domain: string;
  answer: string | null;
  reason: string | null;
  duration: number | null;
  blocked: boolean;
}

export interface DnsHistoryQuery {
  filter?: string;
  client?: string;
  domain?: string;
  blocked?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  sort?: 'asc' | 'desc';
}

export const DnsHistoryQuerySchema = z.object({
  filter: z.string().optional(),
  client: z.string().optional(),
  domain: z.string().optional(),
  // h3's getValidatedQuery returns query params as strings and zod v4 does
  // not coerce, so map 'true'/'false' explicitly. z.coerce.boolean() would
  // turn 'false' into true, so an enum + transform is required. Absent stays
  // undefined so the service can distinguish "not filtered" from "allowed".
  blocked: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export type DnsHistoryQueryInput = z.infer<typeof DnsHistoryQuerySchema>;

export interface DnsHistoryResponse {
  queries: DnsQueryPublic[];
  total: number;
  limit: number;
  offset: number;
}
