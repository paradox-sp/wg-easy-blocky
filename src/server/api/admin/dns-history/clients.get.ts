import DnsQuery from '#db/repositories/dnsQuery/service';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  const clients = await DnsQuery.getClients();
  return { success: true, clients };
});
