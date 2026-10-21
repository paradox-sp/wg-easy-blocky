import Blocky from '#server/utils/blocky';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  const config = await Blocky.getConfig();
  return { success: true, config };
});
