<script setup lang="ts">
import { TARGET_LANGUAGES } from '~/utils/languages'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto max-w-xl px-4 py-8">
      <h1 class="mb-6 text-2xl font-bold">Settings</h1>

      <el-form label-position="top">
        <el-form-item label="Translate to">
          <el-select v-model="settings.targetLang" filterable class="w-full">
            <el-option v-for="lang in TARGET_LANGUAGES" :key="lang.code" :label="lang.name" :value="lang.code" />
          </el-select>
          <p class="mt-1 text-sm text-gray-500">
            The language AI uses for word meanings and sentence translations.
          </p>
        </el-form-item>

        <el-form-item label="App theme">
          <el-radio-group v-model="settings.theme">
            <el-radio-button value="light">Light</el-radio-button>
            <el-radio-button value="sepia">Sepia</el-radio-button>
            <el-radio-button value="dark">Dark</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <p class="mt-8 text-sm text-gray-500">
        Font, text size, spacing and margins are adjusted from inside the reader (Aa button).
      </p>
    </main>
  </div>
</template>
