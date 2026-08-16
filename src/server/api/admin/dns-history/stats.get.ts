import DnsQuery from '#db/repositories/dnsQuery/service';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  const stats = await DnsQuery.getStats();
  return { success: true, stats };
});
