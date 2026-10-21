import Database from '#server/utils/Database';
import Blocky from '#server/utils/blocky';
import { BLOCKY_ENV } from '#server/utils/config';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  await Database.blockyConfig.resetToDefaults();
  const config = await Blocky.reloadConfig();
  const status = BLOCKY_ENV.ENABLED ? await Blocky.waitUntilReady() : null;

  return { success: true, config, status };
});
