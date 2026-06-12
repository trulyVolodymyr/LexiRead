<script setup lang="ts">
import type { Book } from '~/types'

const library = useLibraryStore()
const { books, progressByBook, coverUrls, loading } = storeToRefs(library)
const { downloadedIds, downloadProgress, refreshDownloadedIds, downloadBook, removeDownload } =
  useOfflineBooks()
const { syncDirty } = useReadingProgress()

const online = useOnline()

onMounted(async () => {
  await refreshDownloadedIds()
  if (online.value) {
    await Promise.all([library.fetchLibrary(), syncDirty()])
  }
})

watch(online, (isOnline) => {
  if (isOnline) {
    library.fetchLibrary()
    syncDirty()
  }
})

// Offline: show only downloaded books from Dexie.
const offlineBooks = ref<Book[]>([])
watchEffect(async () => {
  if (online.value) return
  const { db } = await import('~/utils/offline/db')
  const rows = await db.books.toArray()
  offlineBooks.value = rows.map((r) => ({
    id: r.id,
    user_id: '',
    title: r.title,
    author: r.author,
    language: r.language,
    format: r.format,
    file_hash: '',
    file_path: '',
    cover_path: null,
    chunk_count: r.chunkCount,
    char_count: r.charCount,
    toc: r.toc,
    status: 'ready' as const,
    created_at: '',
  }))
})

const visibleBooks = computed(() => (online.value ? books.value : offlineBooks.value))

async function onDownload(book: Book) {
  const ok = await downloadBook(book, coverUrls.value[book.id])
  ElMessage[ok ? 'success' : 'error'](ok ? `“${book.title}” is available offline` : 'Download failed')
}

async function onDelete(book: Book) {
  try {
    await ElMessageBox.confirm(
      `Delete “${book.title}” from your library? This also removes it from the server.`,
      'Delete book',
      { type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel' },
    )
  } catch {
    return
  }
  await library.deleteBook(book.id)
  await removeDownload(book.id)
  ElMessage.success('Book deleted')
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto max-w-5xl px-4 py-8">
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-bold">My library</h1>
        <el-tag v-if="!online" type="warning">Offline — showing downloaded books</el-tag>
      </div>

      <div v-if="loading" class="py-16 text-center text-gray-500">Loading…</div>

      <div
        v-else-if="!visibleBooks.length"
        class="flex flex-col items-center gap-4 py-20 text-center"
      >
        <div class="text-5xl">📚</div>
        <p class="text-gray-500">
          {{ online ? 'Your library is empty.' : 'No downloaded books on this device.' }}
        </p>
        <NuxtLink v-if="online" to="/upload">
          <el-button type="primary">Upload your first book</el-button>
        </NuxtLink>
      </div>

      <div v-else class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <div v-for="book in visibleBooks" :key="book.id" class="relative">
          <BookCard
            :book="book"
            :cover-url="coverUrls[book.id]"
            :progress="progressByBook[book.id]"
            :downloaded="downloadedIds.has(book.id)"
            @download="onDownload(book)"
            @remove-download="removeDownload(book.id)"
            @delete="onDelete(book)"
          />
          <el-progress
            v-if="downloadProgress[book.id] !== undefined"
            :percentage="downloadProgress[book.id]"
            :show-text="false"
            :stroke-width="3"
            class="absolute inset-x-0 bottom-0"
          />
        </div>
      </div>
    </main>
  </div>
</template>
