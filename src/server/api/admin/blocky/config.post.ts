import { readValidatedBody } from 'h3';

import Database from '#server/utils/Database';
import Blocky from '#server/utils/blocky';
import { BLOCKY_ENV } from '#server/utils/config';
import { definePermissionEventHandler } from '#server/utils/handler';
import { validateZod } from '#server/utils/types';
import { BlockyConfigUpdateSchema } from '#db/repositories/blockyConfig/types';

export default definePermissionEventHandler('admin', 'any', async ({ event }) => {
  const data = await readValidatedBody(
    event,
    validateZod(BlockyConfigUpdateSchema, event)
  );

  await Database.blockyConfig.updateConfig(data);
  await Blocky.reloadConfig();

  if (BLOCKY_ENV.ENABLED) {
    const status = await Blocky.waitUntilReady();
    return { success: true, status };
  }

  return { success: true };
});
