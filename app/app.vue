<script setup lang="ts">
const settingsStore = useSettingsStore()

onMounted(() => {
  settingsStore.init()
})

useHead({
  title: 'LexiRead',
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
    <NuxtPage />
  </div>
</template>
