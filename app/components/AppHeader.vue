<script setup lang="ts">
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()

async function signOut() {
  await supabase.auth.signOut()
  router.push('/login')
}
</script>

<template>
  <header
    class="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90"
  >
    <NuxtLink to="/" class="flex items-center gap-2 text-lg font-bold">
      <span>📖</span>
      <span>LexiRead</span>
    </NuxtLink>

    <div class="flex items-center gap-3">
      <NuxtLink to="/upload">
        <el-button type="primary" size="small">Upload book</el-button>
      </NuxtLink>
      <el-dropdown v-if="user" trigger="click">
        <el-avatar :size="32" :src="user.user_metadata?.avatar_url">
          {{ (user.user_metadata?.full_name ?? user.email ?? '?').charAt(0).toUpperCase() }}
        </el-avatar>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="router.push('/settings')">Settings</el-dropdown-item>
            <el-dropdown-item divided @click="signOut">Sign out</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>
