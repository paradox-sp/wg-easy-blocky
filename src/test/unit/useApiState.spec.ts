import { describe, expect, test } from 'vitest';

import { useApiState } from '../../app/composables/useApiState';

describe('useApiState', () => {
  test('stays loading until every concurrent request settles', async () => {
    const firstResult = Promise.withResolvers<undefined>();
    const secondResult = Promise.withResolvers<undefined>();
    const { loading, run } = useApiState();

    const first = run(() => firstResult.promise, 'first failed');
    const second = run(() => secondResult.promise, 'second failed');
    expect(loading.value).toBe(true);

    firstResult.resolve(undefined);
    await first;
    expect(loading.value).toBe(true);

    secondResult.resolve(undefined);
    await second;
    expect(loading.value).toBe(false);
  });
});
