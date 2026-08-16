import { eq, sql } from 'drizzle-orm';

import { blockyConfig } from './schema';
import type {
  BlockyConfigSchema,
  BlockyConfigType,
  BlockyConfigUpdateType,
} from './types';

import type { DBType } from '#db/sqlite';
import { BLOCKY_ENV } from '#server/utils/config';

function createPreparedStatement(db: DBType) {
  return {
    getAll: db.query.blockyConfig.findMany().prepare(),
    getByKey: db.query.blockyConfig
      .findFirst({ where: eq(blockyConfig.key, sql.placeholder('key')) })
      .prepare(),
    upsert: db
      .insert(blockyConfig)
      .values({
        key: sql.placeholder('key') as never as string,
        value: sql.placeholder('value') as never as string,
      })
      .onConflictDoUpdate({
        target: blockyConfig.key,
        set: { value: sql.placeholder('value') as never as string },
      })
      .prepare(),
  };
}

export class BlockyConfigService {
  #statements: ReturnType<typeof createPreparedStatement>;

  constructor(db: DBType) {
    this.#statements = createPreparedStatement(db);
  }

  async getAll(): Promise<BlockyConfigType[]> {
    return this.#statements.getAll.execute();
  }

  async get(key: string): Promise<BlockyConfigType | undefined> {
    return this.#statements.getByKey.execute({ key });
  }

  async set(key: string, value: string): Promise<void> {
    await this.#statements.upsert.execute({ key, value });
  }

  async getConfig(): Promise<BlockyConfigSchema> {
    const defaults = this.#getDefaults();
    const configs = await this.getAll();
    const merged: BlockyConfigSchema = structuredClone(defaults);

    for (const config of configs) {
      try {
        const parsed = JSON.parse(config.value) as Partial<BlockyConfigSchema>;
        Object.assign(merged, parsed);
      } catch {
        // Ignore invalid JSON
      }
    }

    return merged;
  }

  async updateConfig(data: BlockyConfigUpdateType): Promise<void> {
    const current = await this.getConfig();
    const merged = { ...current, ...data };
    await this.set('config', JSON.stringify(merged, null, 2));
  }

  async resetToDefaults(): Promise<void> {
    const defaults = this.#getDefaults();
    await this.set('config', JSON.stringify(defaults, null, 2));
  }

  #getDefaults(): BlockyConfigSchema {
    return {
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
      queryLog: {
        type: 'csv',
        target: BLOCKY_ENV.LOG_DIR,
        logRetentionDays: 7,
      },
      prometheus: { enable: true, path: '/metrics' },
      conditional: { mapping: {} },
    };
  }
}
