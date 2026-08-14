import { getValidatedQuery } from 'h3';

import DnsQuery from '#server/utils/dnsHistory';
import { definePermissionEventHandler } from '#server/utils/handler';
import { validateZod } from '#server/utils/types';
import { DnsHistoryQuerySchema } from '#db/repositories/dnsQuery/types';

export default definePermissionEventHandler('admin', 'any', async ({ event }) => {
  const query = await getValidatedQuery(
    event,
    validateZod(DnsHistoryQuerySchema, event)
  );

  const result = await DnsQuery.getHistory(query);
  return { success: true, ...result };
});
