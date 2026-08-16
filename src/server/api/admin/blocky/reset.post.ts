import Database from '#server/utils/Database';
import Blocky from '#server/utils/blocky';
import { BLOCKY_ENV } from '#server/utils/config';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  await Database.blockyConfig.resetToDefaults();
  await Blocky.reloadConfig();

  if (BLOCKY_ENV.ENABLED) {
    const status = await Blocky.waitUntilReady();
    return { success: true, status };
  }

  return { success: true };
});
