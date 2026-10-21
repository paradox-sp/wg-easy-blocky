export type AdminNavigationItem = {
  id: string;
  to: string;
  name: string;
  description: string;
};

export type AdminNavigationGroup = {
  id: 'system' | 'services';
  name: string;
  items: AdminNavigationItem[];
};

export function useAdminNavigation() {
  const { t } = useI18n();
  const globalStore = useGlobalStore();

  return computed<AdminNavigationGroup[]>(() => {
    const system: AdminNavigationGroup = {
      id: 'system',
      name: t('admin.navigation.system'),
      items: [
        {
          id: 'general',
          to: '/admin/general',
          name: t('pages.admin.general'),
          description: t('admin.navigation.generalDescription'),
        },
        {
          id: 'config',
          to: '/admin/config',
          name: t('pages.admin.config'),
          description: t('admin.navigation.configDescription'),
        },
        {
          id: 'interface',
          to: '/admin/interface',
          name: t('pages.admin.interface'),
          description: t('admin.navigation.interfaceDescription'),
        },
        {
          id: 'hooks',
          to: '/admin/hooks',
          name: t('pages.admin.hooks'),
          description: t('admin.navigation.hooksDescription'),
        },
      ],
    };

    const services: AdminNavigationGroup = {
      id: 'services',
      name: t('admin.navigation.services'),
      items: [],
    };

    if (globalStore.blockyEnabled) {
      services.items.push(
        {
          id: 'blocky',
          to: '/admin/blocky',
          name: t('pages.admin.blocky'),
          description: t('admin.navigation.blockyDescription'),
        },
        {
          id: 'dns-history',
          to: '/admin/dns-history',
          name: t('pages.admin.dnsHistory'),
          description: t('admin.navigation.dnsHistoryDescription'),
        }
      );
    }

    if (globalStore.victoriaMetricsEnabled) {
      services.items.push({
        id: 'metrics',
        to: '/admin/metrics',
        name: t('pages.admin.metrics'),
        description: t('admin.navigation.metricsDescription'),
      });
    }

    return services.items.length > 0 ? [system, services] : [system];
  });
}
