import { $fetch } from 'ofetch';

import { cacheFunction } from '#server/utils/cache';
import { RELEASE, SERVER_DEBUG, WG_ENV } from '#server/utils/config';

type GithubRelease = {
  tag_name: string;
  body: string;
};

async function fetchLatestRelease() {
  if (WG_ENV.DISABLE_VERSION_CHECK) {
    return {
      version: RELEASE,
      changelog: '',
    };
  }

  try {
    const response = await $fetch<GithubRelease>(
      'https://api.github.com/repos/wg-easy/wg-easy/releases/latest',
      { method: 'get', timeout: 5000 }
    );
    if (!response) {
      throw new Error('Empty Response');
    }
    const changelog = response.body.split('\r\n\r\n')[0] ?? '';
    return {
      version: response.tag_name,
      changelog,
    };
  } catch (error) {
    SERVER_DEBUG('Failed to fetch latest release:', error);
    return {
      version: RELEASE,
      changelog: '',
    };
  }
}

/**
 * Fetch latest release from GitHub
 * @cache Response is cached for 1 hour
 */
export const cachedFetchLatestRelease = cacheFunction(fetchLatestRelease, {
  expiry: 60 * 60 * 1000,
});
