<script setup lang="ts">
// @nuxtjs/supabase completes the PKCE exchange on this route, then redirects.
const user = useSupabaseUser()

watchEffect(() => {
  if (user.value) navigateTo('/')
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <span class="text-gray-500">Signing you in…</span>
  </div>
</template>
