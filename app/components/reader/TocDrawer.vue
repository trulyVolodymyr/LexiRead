<script setup lang="ts">
import type { TocEntry } from '~/types'

const visible = defineModel<boolean>({ default: false })

defineProps<{ toc: TocEntry[]; currentChunk: number }>()
const emit = defineEmits<{ navigate: [entry: TocEntry] }>()
</script>

<template>
  <el-drawer v-model="visible" title="Contents" direction="ltr" size="320px">
    <nav class="-mx-2">
      <button
        v-for="(entry, i) in toc"
        :key="i"
        class="block w-full rounded px-2 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
        :class="{
          'font-semibold text-blue-600 dark:text-blue-400':
            currentChunk >= entry.chunkIndex && (toc[i + 1] ? currentChunk < toc[i + 1]!.chunkIndex : true),
        }"
        @click="emit('navigate', entry), (visible = false)"
      >
        {{ entry.title }}
      </button>
    </nav>
  </el-drawer>
</template>
