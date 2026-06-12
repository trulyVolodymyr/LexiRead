<script setup lang="ts">
import type { Book, TocEntry } from '~/types'
import type { Position } from '~/composables/useReadingProgress'
import ReaderPaginated from '~/components/reader/ReaderPaginated.vue'
import { db } from '~/utils/offline/db'

const route = useRoute()
const bookId = route.params.id as string

const supabase = useSupabaseClient()
const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)
const progressStore = useReadingProgress()
const { selectWordAt, clearHighlight } = useWordSelection()
const translation = useTranslation()

const book = ref<Book | null>(null)
const initialPosition = ref<Position | null>(null)
const ready = ref(false)
const notFound = ref(false)

const tocVisible = ref(false)
const settingsVisible = ref(false)
const translationVisible = ref(false)
const currentWord = ref('')
const currentSentence = ref('')
const currentContext = ref('')

interface ReaderHandle {
  jumpTo: (chunkIndex: number, charOffset: number, anchorY?: number) => void | Promise<void>
  container: HTMLElement | undefined
}
const viewport = ref<ReaderHandle>()
const lastPosition = ref<Position>({ chunkIndex: 0, charOffset: 0, percent: 0 })

onMounted(async () => {
  // online → server row; offline → Dexie copy of a downloaded book
  if (navigator.onLine) {
    const { data } = await supabase.from('books').select('*').eq('id', bookId).maybeSingle()
    if (data) book.value = data as unknown as Book
  }
  if (!book.value) {
    const local = await db.books.get(bookId)
    if (local) {
      book.value = {
        id: local.id,
        user_id: '',
        title: local.title,
        author: local.author,
        language: local.language,
        format: local.format,
        file_hash: '',
        file_path: '',
        cover_path: null,
        chunk_count: local.chunkCount,
        char_count: local.charCount,
        toc: local.toc,
        status: 'ready',
        created_at: '',
      }
    }
  }
  if (!book.value) {
    notFound.value = true
    return
  }

  const saved = await progressStore.load(bookId)
  initialPosition.value = saved
  if (saved) lastPosition.value = saved
  ready.value = true
})

function onPosition(position: Position) {
  lastPosition.value = position
  progressStore.save(bookId, position)
}

function onTap(event: PointerEvent) {
  const container = viewport.value?.container
  if (!container || !book.value) return

  const selection = selectWordAt(event.clientX, event.clientY, container, book.value.language)
  if (!selection) {
    translationVisible.value = false
    return
  }
  currentWord.value = selection.word
  currentSentence.value = selection.sentence
  currentContext.value = selection.context
  translationVisible.value = true
  translation.translateWord(selection.word, selection.context, book.value.language, settings.value.targetLang)
}

function onTranslateSentence() {
  if (!book.value) return
  translation.translateSentence(currentSentence.value, book.value.language, settings.value.targetLang)
}

// drawer closed (X, Esc, empty tap) → drop the highlight and stale results
watch(translationVisible, (open) => {
  if (!open) {
    translation.reset()
    clearHighlight()
  }
})

// target language changed while the drawer is open → re-translate the same word
watch(
  () => settings.value.targetLang,
  (targetLang) => {
    if (translationVisible.value && currentWord.value && book.value) {
      translation.translateWord(currentWord.value, currentContext.value, book.value.language, targetLang)
    }
  },
)

function onTocNavigate(entry: TocEntry) {
  translationVisible.value = false
  viewport.value?.jumpTo(entry.chunkIndex, entry.charOffset)
}

// Reflow-affecting settings changed → restore position from the text anchor.
watch(
  () => [settings.value.fontSize, settings.value.fontFamily, settings.value.lineHeight, settings.value.marginsPct],
  async () => {
    await nextTick()
    viewport.value?.jumpTo(lastPosition.value.chunkIndex, lastPosition.value.charOffset, lastPosition.value.anchorY)
  },
)

const readerStyle = computed(() => ({
  '--reader-font': settings.value.fontFamily,
  '--reader-size': `${settings.value.fontSize}px`,
  '--reader-leading': String(settings.value.lineHeight),
  '--reader-margin': `${settings.value.marginsPct}%`,
}))

const percentLabel = computed(() => `${Math.round(lastPosition.value.percent * 100)}%`)
</script>

<template>
  <div
    class="flex h-screen flex-col"
    :data-reader-theme="settings.theme"
    :style="{ backgroundColor: 'var(--reader-bg)' }"
  >
    <!-- top bar -->
    <header
      class="flex items-center justify-between gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10"
      :style="{ color: 'var(--reader-fg)' }"
    >
      <div class="flex min-w-0 items-center gap-2">
        <NuxtLink to="/" class="shrink-0 rounded p-1 text-lg hover:bg-black/5 dark:hover:bg-white/10">←</NuxtLink>
        <span class="truncate text-sm font-medium">{{ book?.title ?? '…' }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <span class="mr-1 text-xs opacity-60">{{ percentLabel }}</span>
        <button class="rounded p-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10" title="Contents" @click="tocVisible = true">☰</button>
        <button class="rounded p-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10" title="Reading settings" @click="settingsVisible = true">Aa</button>
      </div>
    </header>

    <!-- content -->
    <div class="min-h-0 flex-1" :style="readerStyle">
      <div v-if="notFound" class="flex h-full flex-col items-center justify-center gap-3">
        <p :style="{ color: 'var(--reader-fg)' }">This book isn't available — it may not be downloaded for offline reading.</p>
        <NuxtLink to="/"><el-button>Back to library</el-button></NuxtLink>
      </div>
      <ReaderPaginated
        v-else-if="ready && book"
        ref="viewport"
        :book-id="bookId"
        :chunk-count="book.chunk_count"
        :char-count="book.char_count"
        :toc="book.toc"
        :initial="initialPosition"
        @position="onPosition"
        @tap="onTap"
      />
      <div v-else class="flex h-full items-center justify-center opacity-60" :style="{ color: 'var(--reader-fg)' }">
        Loading…
      </div>
    </div>

    <TocDrawer v-if="book" v-model="tocVisible" :toc="book.toc" :current-chunk="lastPosition.chunkIndex" @navigate="onTocNavigate" />
    <ReaderSettingsDrawer v-model="settingsVisible" />
    <TranslationDrawer
      v-if="book"
      v-model="translationVisible"
      :src-lang="book.language"
      :loading="translation.loading.value"
      :sentence-loading="translation.sentenceLoading.value"
      :word="translation.wordResult.value"
      :sentence="translation.sentenceResult.value"
      :error="translation.error.value"
      @translate-sentence="onTranslateSentence"
    />
  </div>
</template>
