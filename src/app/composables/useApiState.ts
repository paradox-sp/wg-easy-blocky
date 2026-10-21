import { ref } from 'vue';

export function useApiState() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  let activeRequests = 0;

  /**
   * Run an async API action with shared loading/error bookkeeping.
   * Returns the action's result, or undefined when it failed. Pass
   * `rethrow: true` when the caller needs to distinguish failure (the
   * original error is rethrown after the message is recorded).
   */
  async function run<T>(
    action: () => Promise<T>,
    fallbackMessage: string,
    rethrow = false
  ): Promise<T | undefined> {
    activeRequests += 1;
    loading.value = true;
    error.value = null;
    try {
      return await action();
    } catch (err) {
      error.value =
        (err as { data?: { message?: string } } | null)?.data?.message ||
        fallbackMessage;
      if (rethrow) throw err;
      return undefined;
    } finally {
      activeRequests -= 1;
      loading.value = activeRequests > 0;
    }
  }

  return { loading, error, run };
}
