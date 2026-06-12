<script setup lang="ts">
import type { Book, ReadingProgress } from '~/types'

const props = defineProps<{
  book: Book
  coverUrl?: string
  progress?: ReadingProgress
  downloaded?: boolean
}>()

const emit = defineEmits<{ delete: []; download: []; removeDownload: [] }>()

const percent = computed(() => Math.round((props.progress?.percent ?? 0) * 100))
</script>

<template>
  <div class="group relative">
    <NuxtLink :to="`/read/${book.id}`" class="block">
      <div class="aspect-[2/3] overflow-hidden rounded-lg bg-gray-200 shadow transition-shadow group-hover:shadow-lg dark:bg-gray-800">
        <img v-if="coverUrl" :src="coverUrl" :alt="book.title" class="h-full w-full object-cover" />
        <div v-else class="flex h-full items-center justify-center p-3 text-center">
          <span class="font-serif text-sm">{{ book.title }}</span>
        </div>
      </div>
      <div class="mt-2">
        <p class="truncate text-sm font-medium" :title="book.title">{{ book.title }}</p>
        <p class="truncate text-xs text-gray-500">{{ book.author ?? '' }}</p>
        <el-progress
          v-if="percent > 0"
          :percentage="percent"
          :stroke-width="4"
          :show-text="false"
          class="mt-1"
        />
      </div>
    </NuxtLink>

    <span
      v-if="downloaded"
      class="absolute left-1.5 top-1.5 rounded bg-green-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
      title="Available offline"
    >
      offline
    </span>

    <el-dropdown class="!absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100" trigger="click">
      <el-button size="small" circle>⋯</el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="!downloaded" @click="emit('download')">Download for offline</el-dropdown-item>
          <el-dropdown-item v-else @click="emit('removeDownload')">Remove download</el-dropdown-item>
          <el-dropdown-item divided @click="emit('delete')">Delete book</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>
