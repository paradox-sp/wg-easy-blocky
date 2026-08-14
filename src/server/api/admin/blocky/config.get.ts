import Database from '#server/utils/Database';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  const config = await Database.blockyConfig.getConfig();
  return { success: true, config };
});
