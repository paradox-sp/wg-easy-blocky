import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createDebug } from 'obug';

import { BLOCKY_ENV } from '#server/utils/config';
import Database from '#server/utils/Database';
import type { BlockyConfigSchema } from '#db/repositories/blockyConfig/types';

const BLOCKY_DEBUG = createDebug('Blocky');

interface BlockyStatus {
  enabled: boolean;
  autoEnableInSec?: number;
  disabledGroups?: string[];
}

class Blocky {
  #baseUrl: string;
  #config: BlockyConfigSchema | null = null;

  constructor() {
    this.#baseUrl = `http://${BLOCKY_ENV.HOST}:${BLOCKY_ENV.HTTP_PORT}`;
  }

  async getConfig(): Promise<BlockyConfigSchema> {
    if (this.#config) return this.#config;
    this.#config = await Database.blockyConfig.getConfig();
    return this.#config;
  }

  async reloadConfig(): Promise<void> {
    this.#config = null;
    const config = await this.getConfig();
    await this.pushConfig(config);
  }

  async pushConfig(config: BlockyConfigSchema): Promise<void> {
    if (!BLOCKY_ENV.ENABLED) {
      BLOCKY_DEBUG('Blocky not enabled, skipping config push');
      return;
    }

    const yaml = this.configToYaml(config);
    BLOCKY_DEBUG(`Writing Blocky config to ${BLOCKY_ENV.CONFIG}...`);

    try {
      await writeFile(BLOCKY_ENV.CONFIG, yaml, 'utf8');
      BLOCKY_DEBUG('Config written, restarting Blocky service...');
      execSync('s6-svc -r /run/service/blocky');
      BLOCKY_DEBUG('Blocky service restarted');
    } catch (error) {
      BLOCKY_DEBUG('Failed to push config:', error);
      throw error;
    }
  }

  async getStatus(): Promise<BlockyStatus | null> {
    if (!BLOCKY_ENV.ENABLED) return null;

    try {
      const response = await fetch(`${this.#baseUrl}/api/blocking/status`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async getMetrics(): Promise<string | null> {
    if (!BLOCKY_ENV.ENABLED) return null;

    try {
      const response = await fetch(`${this.#baseUrl}/metrics`);
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  configToYaml(config: BlockyConfigSchema): string {
    const lines: string[] = [];
    lines.push('ports:');
    lines.push('  dns: 53');
    lines.push(`  http: ${BLOCKY_ENV.HTTP_PORT}`);
    lines.push('');
    lines.push('log:');
    lines.push('  level: info');
    lines.push('  format: text');
    lines.push('');
    lines.push('upstreams:');
    lines.push('  groups:');
    lines.push('    default:');
    for (const upstream of config.upstream) {
      lines.push(`      - ${upstream}`);
    }
    lines.push('');
    lines.push('bootstrapDns:');
    for (const dns of config.bootstrapDns) {
      lines.push(`  - ${dns}`);
    }
    lines.push('');
    lines.push('blocking:');
    lines.push(
      `  blockType: ${config.blocking.blockType === 'zeroIp' ? 'ZEROIP' : 'NXDOMAIN'}`
    );
    lines.push('  denylists:');
    lines.push('    default:');
    for (const list of config.blocking.blockLists) {
      lines.push(`      - ${list}`);
    }
    lines.push('  allowlists:');
    lines.push('    default:');
    for (const list of config.blocking.allowLists) {
      lines.push(`      - ${list}`);
    }
    // v0.30.0+: Blocky fails to start if clientGroupsBlock references a group
    // not defined in denylists/allowlists. We only ever define the 'default'
    // group, so drop any other references defensively.
    const definedGroups = new Set(['default']);
    lines.push('  clientGroupsBlock:');
    for (const [group, lists] of Object.entries(
      config.blocking.clientGroupsBlock
    )) {
      if (!definedGroups.has(group)) continue;
      lines.push(`    ${group}:`);
      for (const list of lists) {
        lines.push(`      - ${list}`);
      }
    }
    lines.push('');
    lines.push('caching:');
    lines.push(`  minTime: ${config.caching.minTime}`);
    lines.push(`  maxTime: ${config.caching.maxTime}`);
    lines.push(`  maxItemsCount: ${config.caching.maxItemsCount}`);
    lines.push('');
    lines.push('queryLog:');
    lines.push(`  type: ${config.queryLog.type}`);
    lines.push(`  target: ${config.queryLog.target}`);
    lines.push(`  logRetentionDays: ${config.queryLog.logRetentionDays}`);
    lines.push('');
    lines.push('prometheus:');
    lines.push(`  enable: ${config.prometheus.enable}`);
    lines.push(`  path: ${config.prometheus.path}`);
    lines.push('');
    lines.push('clientLookup:');
    lines.push('  clients: {}');
    lines.push('');
    if (Object.keys(config.conditional.mapping).length > 0) {
      lines.push('conditional:');
      lines.push('  mapping:');
      for (const [key, value] of Object.entries(config.conditional.mapping)) {
        lines.push(`    ${key}: ${value}`);
      }
    }
    return lines.join('\n');
  }
}

export default new Blocky();