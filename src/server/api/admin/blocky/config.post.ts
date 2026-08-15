import { createError, readValidatedBody } from 'h3';

import Database from '#server/utils/Database';
import Blocky from '#server/utils/blocky';
import { BLOCKY_ENV } from '#server/utils/config';
import { definePermissionEventHandler } from '#server/utils/handler';
import { validateZod } from '#server/utils/types';
import { BlockyConfigUpdateSchema } from '#db/repositories/blockyConfig/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default definePermissionEventHandler('admin', 'any', async ({ event }) => {
  const data = await readValidatedBody(
    event,
    validateZod(BlockyConfigUpdateSchema, event)
  );

  await Database.blockyConfig.updateConfig(data);
  await Blocky.reloadConfig();

  if (BLOCKY_ENV.ENABLED) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const status = await Blocky.getStatus();
      if (status) return { success: true, status };
      await sleep(500);
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Blocky did not come back up after config reload',
    });
  }

  return { success: true };
});
