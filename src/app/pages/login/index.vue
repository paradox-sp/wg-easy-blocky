<template>
  <div class="flex flex-col gap-5">
    <div
      v-if="authMethods && authMethods.oauthEnabled"
      class="flex flex-col gap-5"
    >
      <UiLoginOauthButton
        v-for="(info, provider) in authMethods.providers"
        :key="provider"
        :provider="provider"
        :info="info"
      />

      <div
        v-if="authMethods.oauthEnabled && !authMethods.passwordDisabled"
        class="flex items-center gap-2"
      >
        <div class="h-px flex-1 bg-gray-300 dark:bg-neutral-600"></div>
        <span class="text-xs text-gray-500 dark:text-neutral-400">
          {{ $t('login.or') }}
        </span>
        <div class="h-px flex-1 bg-gray-300 dark:bg-neutral-600"></div>
      </div>
    </div>

    <form
      v-if="!authMethods?.passwordDisabled"
      class="flex flex-col gap-4"
      @submit.prevent="submit"
    >
      <label class="flex flex-col gap-1.5" for="username">
        <span class="text-sm font-medium">{{ $t('general.username') }}</span>
        <BaseInput
          id="username"
          v-model="username"
          type="text"
          autocomplete="username"
          autofocus
          name="username"
        />
      </label>

      <label class="flex flex-col gap-1.5" for="password">
        <span class="text-sm font-medium">{{ $t('general.password') }}</span>
        <BaseInput
          id="password"
          v-model="password"
          type="password"
          name="password"
          autocomplete="current-password"
        />
      </label>

      <label
        class="flex items-center gap-2 whitespace-nowrap"
        :title="$t('login.rememberMeDesc')"
      >
        <BaseSwitch v-model="remember" />
        <span class="text-sm">{{ $t('login.rememberMe') }}</span>
      </label>

      <button
        class="mt-1 min-h-10 rounded-lg bg-red-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-200 dark:bg-red-800 dark:text-white dark:hover:bg-red-700 dark:focus:ring-offset-neutral-700 disabled:dark:bg-neutral-800"
        :disabled="!password || !username || authenticating"
      >
        <IconsLoading v-if="authenticating" class="mx-auto w-5 animate-spin" />
        <span v-else>{{ $t('login.signIn') }}</span>
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { $fetch } from '#imports';

const toast = useToast();
const { t } = useI18n();
const route = useRoute();

const authenticating = ref(false);
const remember = ref(false);
const username = ref<string>('');
const password = ref<string>('');

const { data: authMethods } = await useFetch('/api/auth/methods');

watchEffect(() => {
  const autoLauchQuery =
    typeof route.query.auto_launch === 'string' && !!route.query.auto_launch
      ? route.query.auto_launch
      : undefined;

  if (authMethods.value?.autoLaunchProvider && !autoLauchQuery) {
    navigateTo(`/api/auth/${authMethods.value.autoLaunchProvider}`, {
      external: true,
    });
  }

  if (
    autoLauchQuery &&
    autoLauchQuery !== 'false' &&
    authMethods.value?.providers?.[autoLauchQuery as OAUTH_PROVIDER]
  ) {
    navigateTo(`/api/auth/${autoLauchQuery}`, {
      external: true,
    });
  }
});

const _submit = useSubmit(
  (data) =>
    $fetch('/api/auth/password', {
      method: 'post',
      body: data,
    }),
  {
    revert: async (success, data) => {
      if (success) {
        if (data?.status === 'success') {
          await navigateTo('/');
        } else if (data?.status === 'TOTP_REQUIRED') {
          authenticating.value = false;
          await navigateTo('/login/2fa');
          return;
        } else if (data?.status === 'INVALID_TOTP_CODE') {
          authenticating.value = false;
          toast.showToast({
            title: t('general.2fa'),
            message: t('login.2faWrong'),
            type: 'error',
          });
          return;
        }
      }
      authenticating.value = false;
      password.value = '';
    },
    noSuccessToast: true,
  }
);

async function submit() {
  if (!username.value || !password.value || authenticating.value) return;

  authenticating.value = true;

  return _submit({
    username: username.value,
    password: password.value,
    remember: remember.value,
  });
}
</script>
