<script setup lang="ts">
import type { LoadedChunk } from '~/composables/useChunks'
import type { Position } from '~/composables/useReadingProgress'
import { charOffsetOf, scrollToCharOffset, topVisiblePosition } from '~/utils/reader/position'

const props = defineProps<{
  bookId: string
  chunkCount: number
  charCount: number
  initial: Position | null
}>()

const emit = defineEmits<{ position: [Position]; tap: [PointerEvent] }>()

const WINDOW_SIZE = 3

const container = ref<HTMLElement>()
const chunks = shallowRef<LoadedChunk[]>([])
const loading = ref(true)
const { getChunk } = useChunks(props.bookId)

let shifting = false

onMounted(async () => {
  await loadWindowAround(props.initial?.chunkIndex ?? 0, props.initial?.charOffset ?? 0)
  setupSentinels()
})

async function loadWindowAround(chunkIndex: number, charOffset: number) {
  const index = Math.max(0, Math.min(chunkIndex, props.chunkCount - 1))
  const wanted = [index, index + 1].filter((i) => i < props.chunkCount)
  const loaded = (await Promise.all(wanted.map(getChunk))).filter(Boolean) as LoadedChunk[]
  chunks.value = loaded
  // chunks must actually render before we can restore position or observe sentinels
  loading.value = false
  await nextTick()
  restoreTo(index, charOffset)
}

/** Public: jump to an arbitrary position (TOC, restore after font change). */
async function jumpTo(chunkIndex: number, charOffset: number) {
  shifting = true
  await loadWindowAround(chunkIndex, charOffset)
  shifting = false
  emitPosition()
}

defineExpose({ jumpTo, container })

function chunkRoot(index: number): HTMLElement | null {
  return container.value?.querySelector(`[data-chunk-index="${index}"]`) ?? null
}

function restoreTo(chunkIndex: number, charOffset: number) {
  const root = chunkRoot(chunkIndex)
  if (!root || !container.value) return
  scrollToCharOffset(container.value, root, charOffset)
}

// ---- window shifting ------------------------------------------------------

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

/**
 * Apply a window mutation while keeping a retained chunk visually fixed:
 * measure its viewport offset before and after, then correct scrollTop by the
 * real difference. Height-based compensation is off by the paragraph margins
 * that collapse through the chunk wrappers, which reads as a visible jump.
 */
async function withStableAnchor(anchorIndex: number, mutate: () => void) {
  const before = chunkRoot(anchorIndex)?.getBoundingClientRect().top
  mutate()
  await nextTick()
  const after = chunkRoot(anchorIndex)?.getBoundingClientRect().top
  if (container.value && before !== undefined && after !== undefined) {
    container.value.scrollTop += after - before
  }
}

/**
 * Right after a restore, chunks below the viewport are still placeholder-sized,
 * which parks the sentinels close enough to fire immediately — never let that
 * evict a chunk the user is actually looking at. The window may temporarily
 * exceed WINDOW_SIZE; it shrinks back on later shifts.
 */
function fullyAbove(index: number): boolean {
  const root = chunkRoot(index)
  const el = container.value
  if (!root || !el) return true
  return root.getBoundingClientRect().bottom < el.getBoundingClientRect().top - 100
}

function fullyBelow(index: number): boolean {
  const root = chunkRoot(index)
  const el = container.value
  if (!root || !el) return true
  return root.getBoundingClientRect().top > el.getBoundingClientRect().bottom + 100
}

async function appendNext() {
  if (shifting || !chunks.value.length) return
  const nextIndex = chunks.value[chunks.value.length - 1]!.index + 1
  if (nextIndex >= props.chunkCount) return
  shifting = true
  try {
    const next = await getChunk(nextIndex)
    if (!next) return
    const dropFirst = chunks.value.length + 1 > WINDOW_SIZE && fullyAbove(chunks.value[0]!.index)
    const anchorIndex = (dropFirst ? chunks.value[1] : chunks.value[0])!.index
    await withStableAnchor(anchorIndex, () => {
      chunks.value = [...(dropFirst ? chunks.value.slice(1) : chunks.value), next]
    })
  } finally {
    shifting = false
  }
}

async function prependPrev() {
  if (shifting || !chunks.value.length) return
  const prevIndex = chunks.value[0]!.index - 1
  if (prevIndex < 0) return
  shifting = true
  try {
    const prev = await getChunk(prevIndex)
    if (!prev) return
    const dropLast = chunks.value.length + 1 > WINDOW_SIZE && fullyBelow(chunks.value[chunks.value.length - 1]!.index)
    await withStableAnchor(chunks.value[0]!.index, () => {
      chunks.value = [prev, ...(dropLast ? chunks.value.slice(0, -1) : chunks.value)]
    })
  } finally {
    shifting = false
  }
}

// ---- position reporting ---------------------------------------------------

function currentPosition(): Position | null {
  if (shifting || !container.value) return null
  const caret = topVisiblePosition(container.value)
  if (!caret) return null
  const rootEl = (caret.node.parentElement ?? null)?.closest('[data-chunk-index]') as HTMLElement | null
  if (!rootEl) return null
  const index = Number(rootEl.dataset.chunkIndex)
  const chunk = chunks.value.find((c) => c.index === index)
  if (!chunk) return null
  const charOffset = charOffsetOf(rootEl, caret.node, caret.offset)
  const percent = props.charCount > 0 ? Math.min(1, (chunk.charStart + charOffset) / props.charCount) : 0
  return { chunkIndex: index, charOffset, percent }
}

const emitPosition = useDebounceFn(() => {
  const position = currentPosition()
  if (position) emit('position', position)
}, 1000)

// The debounce loses the final second of reading on reload/close — flush the
// exact position the moment the page is hidden.
useEventListener(document, 'visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return
  const position = currentPosition()
  if (position) emit('position', position)
})

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
      <div v-if="chunks.length && chunks[chunks.length - 1]!.index === chunkCount - 1" class="py-12 text-center opacity-50">
        ✦ The end ✦
      </div>
    </template>
  </div>
</template>
