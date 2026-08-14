import Database from '#server/utils/Database';
import Blocky from '#server/utils/blocky';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  await Database.blockyConfig.resetToDefaults();
  await Blocky.reloadConfig();
  return { success: true };
});
