<template>
  <main>
    <UiBanner />
    <HeaderInsecure />
    <div
      class="mx-auto flex w-[calc(100%_-_1.5rem)] max-w-sm flex-col gap-6 rounded-xl border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
    >
      <div
        class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-800 shadow-sm"
      >
        <IconsAvatar class="h-8 w-8 text-white" />
      </div>

      <div class="text-center">
        <h1 class="text-2xl font-semibold">
          {{ isTwoFactor ? $t('general.2fa') : $t('login.signIn') }}
        </h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          {{ isTwoFactor ? $t('login.2faRequired') : $t('login.welcomeBack') }}
        </p>
      </div>

      <NuxtPage />

      <p
        v-if="!isTwoFactor"
        class="text-center text-xs text-gray-400 dark:text-neutral-400"
      >
        {{ $t('login.protected') }}
      </p>
    </div>
  </main>
</template>

<script setup lang="ts">
const route = useRoute();
const isTwoFactor = computed(() => route.path === '/login/2fa');
</script>
