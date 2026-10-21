import VictoriaMetrics from '#server/utils/victoriaMetrics';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  const dashboard = await VictoriaMetrics.getDashboard();

  return {
    success: true,
    ...dashboard,
  };
});
