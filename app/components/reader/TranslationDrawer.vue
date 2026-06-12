<script setup lang="ts">
import type { SentenceTranslation, WordTranslation } from '~/types'
import { TARGET_LANGUAGES, languageName } from '~/utils/languages'

const props = defineProps<{
  srcLang: string
  loading: boolean
  sentenceLoading: boolean
  word: WordTranslation | null
  sentence: SentenceTranslation | null
  error: string | null
}>()

const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ translateSentence: [] }>()

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const sentenceOpen = ref(false)

function toggleSentence() {
  sentenceOpen.value = !sentenceOpen.value
  if (sentenceOpen.value && !props.sentence && !props.sentenceLoading) emit('translateSentence')
}

// new word → collapse the sentence section again
watch(
  () => props.word,
  () => {
    sentenceOpen.value = false
  },
)

// No modal overlay (reading stays interactive), so close on outside clicks
// ourselves. Reader-text clicks are excluded: pointerup there either switches
// to the tapped word or closes on an empty tap. Popper = the language dropdown.
useEventListener(document, 'pointerdown', (event) => {
  if (!visible.value) return
  const target = event.target as HTMLElement | null
  if (!target) return
  if (target.closest('.translation-drawer') || target.closest('.el-popper') || target.closest('.reader-content')) return
  visible.value = false
})

const srcChip = computed(() => `${props.srcLang.toUpperCase()} ${languageName(props.srcLang)}`)
const contextPos = computed(() => props.word?.meanings?.[0]?.pos ?? null)
</script>

<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    :size="380"
    :with-header="false"
    :modal="false"
    :lock-scroll="false"
    class="translation-drawer"
  >
    <div class="flex h-full flex-col">
      <!-- header: word + close -->
      <div class="px-5 pb-4 pt-4">
        <div class="flex items-start justify-between gap-3">
          <h2 class="min-w-0 break-words text-3xl font-bold" style="font-family: Georgia, serif">
            {{ word?.word ?? '…' }}
          </h2>
          <button
            class="shrink-0 rounded p-1.5 text-lg leading-none opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
            aria-label="Close"
            @click="visible = false"
          >
            ✕
          </button>
        </div>
        <div v-if="word" class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span class="rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            {{ srcChip }}
          </span>
          <span v-if="word.transliteration" class="italic text-gray-500">/{{ word.transliteration }}/</span>
          <span v-if="word.lemma && word.lemma !== word.word" class="text-gray-500">base: {{ word.lemma }}</span>
        </div>
      </div>

      <!-- translate to -->
      <div class="flex items-center justify-between gap-3 border-y border-black/10 bg-amber-50/60 px-5 py-3 dark:border-white/10 dark:bg-amber-950/20">
        <span class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <span aria-hidden="true">🌐</span>
          Translate to
        </span>
        <el-select v-model="settings.targetLang" filterable size="default" style="width: 150px">
          <el-option v-for="lang in TARGET_LANGUAGES" :key="lang.code" :label="lang.name" :value="lang.code" />
        </el-select>
      </div>

      <!-- content -->
      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <el-skeleton v-if="loading" :rows="5" animated />

        <el-alert v-else-if="error" :title="error" type="warning" :closable="false" />

        <template v-else-if="word">
          <!-- in this sentence -->
          <div v-if="word.bestInContext" class="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/30">
            <div class="text-xs font-semibold uppercase tracking-widest text-amber-800/70 dark:text-amber-200/70">
              In this sentence
            </div>
            <div class="mt-2 break-words text-2xl font-bold" style="font-family: Georgia, serif">
              {{ word.bestInContext.translation }}
            </div>
            <span
              v-if="contextPos"
              class="mt-2 inline-block rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-amber-900 shadow-sm dark:bg-amber-900/50 dark:text-amber-100"
            >
              {{ contextPos }}
            </span>
            <p class="mt-2 text-sm italic text-gray-600 dark:text-gray-400">{{ word.bestInContext.explanation }}</p>
          </div>

          <!-- other meanings -->
          <div v-if="word.meanings.length" class="mt-5">
            <div class="text-xs font-semibold uppercase tracking-widest text-gray-400">Other meanings</div>
            <ol class="mt-2">
              <li
                v-for="(meaning, i) in word.meanings"
                :key="i"
                class="flex gap-3 border-b border-black/5 py-3 last:border-b-0 dark:border-white/10"
              >
                <span
                  class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-black/10 text-xs text-gray-500 dark:border-white/20"
                >
                  {{ i + 1 }}
                </span>
                <div class="min-w-0">
                  <span class="font-semibold">{{ meaning.translation }}</span>
                  <span v-if="meaning.pos" class="ml-1.5 text-sm text-gray-400">· {{ meaning.pos }}</span>
                  <span v-if="meaning.register" class="ml-1.5 text-sm text-amber-700 dark:text-amber-400">· {{ meaning.register }}</span>
                  <p v-if="meaning.note" class="mt-0.5 text-sm italic text-gray-500">"{{ meaning.note }}"</p>
                </div>
              </li>
            </ol>
          </div>

          <!-- whole sentence -->
          <div class="mt-5 border-t border-black/10 pt-1 dark:border-white/10">
            <button
              class="flex w-full items-center justify-between gap-2 py-3 text-left font-medium hover:opacity-80"
              @click="toggleSentence"
            >
              <span class="flex items-center gap-2">
                <span aria-hidden="true">🌐</span>
                Translate the whole sentence
              </span>
              <span class="text-gray-400 transition-transform" :class="{ 'rotate-180': sentenceOpen }">⌄</span>
            </button>
            <div v-if="sentenceOpen" class="pb-3">
              <el-skeleton v-if="sentenceLoading" :rows="2" animated />
              <template v-else-if="sentence">
                <p class="italic">{{ sentence.translation }}</p>
                <p v-if="sentence.notes" class="mt-1.5 text-sm text-gray-500">{{ sentence.notes }}</p>
              </template>
            </div>
          </div>
        </template>

        <p v-else class="py-10 text-center text-sm opacity-50">Tap a word in the text to translate it.</p>
      </div>
    </div>
  </el-drawer>
</template>
