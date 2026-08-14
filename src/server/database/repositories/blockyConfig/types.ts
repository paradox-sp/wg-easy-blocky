import type { InferSelectModel } from 'drizzle-orm';
import z from 'zod';

import { blockyConfig } from './schema';

import { safeStringRefine, t } from '#server/utils/types';

export type BlockyConfigType = InferSelectModel<typeof blockyConfig>;

export interface BlockyConfigSchema {
  upstream: string[];
  bootstrapDns: string[];
  blocking: {
    blockType: 'zeroIp' | 'nxdomain';
    blockLists: string[];
    allowLists: string[];
    clientGroupsBlock: Record<string, string[]>;
  };
  caching: {
    minTime: string;
    maxTime: string;
    maxItemsCount: number;
  };
  queryLog: {
    type: 'csv' | 'console' | 'none';
    target: string;
    logRetentionDays: number;
  };
  prometheus: {
    enable: boolean;
    path: string;
  };
  conditional: {
    mapping: Record<string, string>;
  };
}

export interface BlockyConfigUpdateType {
  upstream?: string[];
  bootstrapDns?: string[];
  blocking?: Partial<BlockyConfigSchema['blocking']>;
  caching?: Partial<BlockyConfigSchema['caching']>;
  queryLog?: Partial<BlockyConfigSchema['queryLog']>;
  prometheus?: Partial<BlockyConfigSchema['prometheus']>;
  conditional?: Partial<BlockyConfigSchema['conditional']>;
}

// Blocky v0.25's ParseUpstream grammar: either a scheme-prefixed upstream
// (http(s)://, tcp://, tcp-tls://, tcp+udp://, udp://, tls://) or a bare
// host[:port] such as `1.1.1.1:53` or `dns.google`. The shipped defaults use
// bare `ip:port` bootstrap entries, so `.url()` is too strict here.
const BLOCKY_UPSTREAM_PROTOCOLS = new Set([
  'http:',
  'https:',
  'tcp:',
  'tcp-tls:',
  'tcp+udp:',
  'udp:',
  'tls:',
]);

// Bare hostname or IPv4 with an optional numeric port (up to five digits;
// range enforcement is left to Blocky itself).
const BARE_HOST_OR_IP = /^[a-zA-Z0-9.\-]+(?::\d{1,5})?$/;

function isValidBlockyUpstream(value: string): boolean {
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.\-]*):\/\//.exec(value);
  if (schemeMatch) {
    if (!BLOCKY_UPSTREAM_PROTOCOLS.has(`${schemeMatch[1]}:`)) return false;
    try {
      new URL(value);
      return true;
    } catch {
      // tcp-tls:// and tcp+udp:// are not valid WHATWG URL schemes, so accept
      // them when a host follows the protocol prefix.
      return value.length > schemeMatch[0].length;
    }
  }
  return BARE_HOST_OR_IP.test(value);
}

const upstreamEntry = z
  .string({ message: t('zod.blocky.upstream') })
  .refine(isValidBlockyUpstream, { message: t('zod.blocky.upstream') });

const bootstrapDnsEntry = z
  .string({ message: t('zod.blocky.bootstrapDns') })
  .refine(isValidBlockyUpstream, { message: t('zod.blocky.bootstrapDns') });

const blockListEntry = z
  .string({ message: t('zod.blocky.blockList') })
  .url({ message: t('zod.blocky.blockList') });

const durationEntry = z
  .string({ message: t('zod.blocky.caching') })
  .pipe(safeStringRefine);

const positiveInt = z
  .number({ message: t('zod.blocky.caching') })
  .int({ message: t('zod.blocky.caching') })
  .positive({ message: t('zod.blocky.caching') });

export const BlockyConfigUpdateSchema = z.object({
  upstream: z.array(upstreamEntry, { message: t('zod.blocky.upstream') }),
  bootstrapDns: z.array(bootstrapDnsEntry, {
    message: t('zod.blocky.bootstrapDns'),
  }),
  blocking: z
    .object({
      blockType: z.enum(['zeroIp', 'nxdomain'], {
        message: t('zod.blocky.blockType'),
      }),
      blockLists: z.array(blockListEntry, {
        message: t('zod.blocky.blockList'),
      }),
      allowLists: z.array(blockListEntry, {
        message: t('zod.blocky.allowList'),
      }),
      clientGroupsBlock: z.record(z.string(), z.array(z.string()), {
        message: t('zod.blocky.clientGroupsBlock'),
      }),
    })
    .optional(),
  caching: z
    .object({
      minTime: durationEntry,
      maxTime: durationEntry,
      maxItemsCount: positiveInt,
    })
    .optional(),
  queryLog: z
    .object({
      type: z.enum(['csv', 'console', 'none'], {
        message: t('zod.blocky.queryLog'),
      }),
      target: z.string({ message: t('zod.blocky.queryLog') }).pipe(safeStringRefine),
      logRetentionDays: positiveInt,
    })
    .optional(),
  prometheus: z
    .object({
      enable: z.boolean({ message: t('zod.blocky.prometheus') }),
      path: z
        .string({ message: t('zod.blocky.prometheus') })
        .pipe(safeStringRefine),
    })
    .optional(),
  conditional: z
    .object({
      mapping: z.record(z.string(), z.string(), {
        message: t('zod.blocky.conditional'),
      }),
    })
    .optional(),
});

export type BlockyConfigUpdateInput = z.infer<typeof BlockyConfigUpdateSchema>;