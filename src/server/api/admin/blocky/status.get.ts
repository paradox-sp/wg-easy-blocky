import Blocky from '#server/utils/blocky';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  const status = await Blocky.getStatus();
  return { success: true, status };
});
