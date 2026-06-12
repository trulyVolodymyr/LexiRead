<script setup lang="ts">
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const loading = ref(false)

watchEffect(() => {
  if (user.value) navigateTo('/')
})

async function signInWithGoogle() {
  loading.value = true
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) {
    loading.value = false
    ElMessage.error('Sign-in failed. Please try again.')
  }
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
    <div class="text-center">
      <div class="mb-2 text-5xl">📖</div>
      <h1 class="text-3xl font-bold">LexiRead</h1>
      <p class="mt-2 max-w-sm text-gray-500 dark:text-gray-400">
        Read books in any language. Click any word for an instant AI translation.
      </p>
    </div>

    <el-button type="primary" size="large" :loading="loading" @click="signInWithGoogle">
      <svg class="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21.35 11.1H12v2.9h5.35c-.5 2.4-2.55 3.9-5.35 3.9a6 6 0 1 1 0-12c1.5 0 2.85.55 3.9 1.45l2.15-2.15A9 9 0 1 0 12 21c5.2 0 8.85-3.65 8.85-8.8 0-.4-.05-.75-.1-1.1Z"
        />
      </svg>
      Continue with Google
    </el-button>
  </div>
</template>
