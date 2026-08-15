import { defineNitroPlugin } from 'nitropack/runtime';

import Blocky from '#server/utils/blocky';
import { databaseReady } from '#server/utils/Database';
import { BLOCKY_ENV } from '#server/utils/config';

export default defineNitroPlugin(async () => {
  if (!BLOCKY_ENV.ENABLED) return;

  await databaseReady;

  // Sync the running Blocky instance with the DB config on container boot.
  // Fire-and-forget: never let a config push failure break app startup.
  Blocky.reloadConfig().catch((error) => {
    console.error('Failed to sync Blocky config on startup:', error);
  });
});