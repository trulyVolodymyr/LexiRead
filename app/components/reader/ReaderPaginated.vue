<script setup lang="ts">
import type { LoadedChunk } from '~/composables/useChunks'
import type { Position } from '~/composables/useReadingProgress'
import type { TocEntry } from '~/types'
import { charOffsetOf, rangeAtCharOffset, topVisiblePosition } from '~/utils/reader/position'

const props = defineProps<{
  bookId: string
  chunkCount: number
  charCount: number
  toc: TocEntry[]
  initial: Position | null
}>()

const emit = defineEmits<{ position: [Position]; tap: [PointerEvent] }>()

const container = ref<HTMLElement>()
const chunks = shallowRef<LoadedChunk[]>([])
const chapter = ref(0)
const loading = ref(true)
const { getChunk } = useChunks(props.bookId)

let shifting = false

// Chunks never span chapters, so TOC entry i owns the contiguous chunk range
// [toc[i].chunkIndex, toc[i+1].chunkIndex - 1].
function chapterOf(chunkIndex: number): number {
  let result = 0
  for (let i = 0; i < props.toc.length; i++) {
    if (props.toc[i]!.chunkIndex <= chunkIndex) result = i
    else break
  }
  return result
}

function chapterStart(i: number): number {
  return props.toc[i]?.chunkIndex ?? 0
}

function chapterEnd(i: number): number {
  return (props.toc[i + 1]?.chunkIndex ?? props.chunkCount) - 1
}

const prevChapter = computed<TocEntry | null>(() => (chapter.value > 0 ? (props.toc[chapter.value - 1] ?? null) : null))
const nextChapter = computed<TocEntry | null>(() => props.toc[chapter.value + 1] ?? null)
const isLastChapter = computed(() => chapter.value >= props.toc.length - 1)
// The chapter-nav footer appears once the chapter's bottom is rendered.
const chapterBottomLoaded = computed(() => {
  const last = chunks.value[chunks.value.length - 1]
  return !!last && last.index >= chapterEnd(chapter.value)
})

onMounted(async () => {
  await openAt(props.initial?.chunkIndex ?? 0, props.initial?.charOffset ?? 0)
  setupSentinels()
})

/** Open the chapter containing chunkIndex, starting the lazy window at that chunk. */
async function openAt(chunkIndex: number, charOffset: number) {
  const target = Math.max(0, Math.min(chunkIndex, props.chunkCount - 1))
  chapter.value = chapterOf(target)
  shifting = true
  try {
    const wanted = [target, target + 1].filter((i) => i <= chapterEnd(chapter.value))
    const loaded = (await Promise.all(wanted.map(getChunk))).filter(Boolean) as LoadedChunk[]
    chunks.value = loaded
    loading.value = false
    await nextTick()
    if (container.value) container.value.scrollTop = 0
    restoreTo(target, charOffset)
  } finally {
    shifting = false
  }
}

async function goToChapter(index: number) {
  const entry = props.toc[index]
  if (!entry) return
  await openAt(entry.chunkIndex, entry.charOffset)
  emitPosition()
}

/** Public: jump to an arbitrary position (TOC, restore after font change). */
async function jumpTo(chunkIndex: number, charOffset: number) {
  await openAt(chunkIndex, charOffset)
  emitPosition()
}

defineExpose({ jumpTo, container })

function chunkRoot(index: number): HTMLElement | null {
  return container.value?.querySelector(`[data-chunk-index="${index}"]`) ?? null
}

function restoreTo(chunkIndex: number, charOffset: number) {
  const root = chunkRoot(chunkIndex)
  const el = container.value
  if (!root || !el) return
  const range = rangeAtCharOffset(root, charOffset)
  const target = range?.getBoundingClientRect()
  if (target && (target.top !== 0 || target.height !== 0)) {
    el.scrollTop += target.top - el.getBoundingClientRect().top - 8
  } else {
    root.scrollIntoView()
  }
}

// ---- lazy loading within the chapter ---------------------------------------
// Same sentinel pattern as scroll mode, but bounded to the current chapter and
// without dropping: a chapter's chunks accumulate so the footer stays reachable.

const topSentinel = ref<HTMLElement>()
const bottomSentinel = ref<HTMLElement>()

function setupSentinels() {
  if (!container.value) return
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        if (entry.target === bottomSentinel.value) void appendNext()
        if (entry.target === topSentinel.value) void prependPrev()
      }
    },
    { root: container.value, rootMargin: '600px 0px' },
  )
  if (topSentinel.value) observer.observe(topSentinel.value)
  if (bottomSentinel.value) observer.observe(bottomSentinel.value)
  onBeforeUnmount(() => observer.disconnect())
}

async function appendNext() {
  if (shifting || !chunks.value.length) return
  const nextIndex = chunks.value[chunks.value.length - 1]!.index + 1
  if (nextIndex > chapterEnd(chapter.value)) return
  shifting = true
  try {
    const next = await getChunk(nextIndex)
    if (next) chunks.value = [...chunks.value, next]
  } finally {
    shifting = false
  }
}

async function prependPrev() {
  if (shifting || !chunks.value.length) return
  const prevIndex = chunks.value[0]!.index - 1
  if (prevIndex < chapterStart(chapter.value)) return
  shifting = true
  try {
    const prev = await getChunk(prevIndex)
    if (!prev) return
    chunks.value = [prev, ...chunks.value]
    await nextTick()
    const added = chunkRoot(prevIndex)?.offsetHeight ?? 0
    if (container.value) container.value.scrollTop += added
  } finally {
    shifting = false
  }
}

// ---- position reporting -----------------------------------------------------

const emitPosition = useDebounceFn(() => {
  if (shifting || !container.value) return
  const caret = topVisiblePosition(container.value)
  if (!caret) return
  const rootEl = (caret.node.parentElement ?? null)?.closest('[data-chunk-index]') as HTMLElement | null
  if (!rootEl) return
  const index = Number(rootEl.dataset.chunkIndex)
  const chunk = chunks.value.find((c) => c.index === index)
  if (!chunk) return
  const charOffset = charOffsetOf(rootEl, caret.node, caret.offset)
  const percent = props.charCount > 0 ? Math.min(1, (chunk.charStart + charOffset) / props.charCount) : 0
  emit('position', { chunkIndex: index, charOffset, percent })
}, 1000)

function onScroll() {
  emitPosition()
}
</script>

<template>
  <div
    ref="container"
    class="reader-content h-full overflow-y-auto overscroll-contain"
    @scroll.passive="onScroll"
    @pointerup="emit('tap', $event)"
  >
    <div v-if="loading" class="py-16 text-center opacity-60">Loading…</div>
    <template v-else>
      <div ref="topSentinel" class="h-px" />
      <ChunkRenderer v-for="chunk in chunks" :key="chunk.index" :chunk="chunk" />
      <div ref="bottomSentinel" class="h-px" />

      <div v-if="chapterBottomLoaded" class="border-t border-black/10 py-8 dark:border-white/15">
        <div class="flex items-stretch gap-3">
          <button
            v-if="prevChapter"
            class="min-w-0 flex-1 rounded-lg border border-black/15 px-4 py-3 text-left hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            @pointerup.stop
            @click="goToChapter(chapter - 1)"
          >
            <div class="text-xs opacity-60">‹ Previous chapter</div>
            <div class="truncate font-medium" style="font-size: 0.9em">{{ prevChapter.title }}</div>
          </button>
          <div v-else class="flex-1" />
          <button
            v-if="nextChapter"
            class="min-w-0 flex-1 rounded-lg border border-black/15 px-4 py-3 text-right hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            @pointerup.stop
            @click="goToChapter(chapter + 1)"
          >
            <div class="text-xs opacity-60">Next chapter ›</div>
            <div class="truncate font-medium" style="font-size: 0.9em">{{ nextChapter.title }}</div>
          </button>
          <div v-else class="flex-1" />
        </div>
        <div v-if="isLastChapter" class="pt-10 text-center opacity-50">✦ The end ✦</div>
      </div>
    </template>
  </div>
</template>
