<script setup lang="ts">
import type { SentenceTranslation, WordTranslation } from '~/types'

const props = defineProps<{
  rect: DOMRect | null
  loading: boolean
  sentenceLoading: boolean
  word: WordTranslation | null
  sentence: SentenceTranslation | null
  error: string | null
}>()

const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ translateSentence: [] }>()

// el-popover virtual triggering: anchor to the highlighted word's rect.
const virtualRef = computed(() =>
  props.rect ? ({ getBoundingClientRect: () => props.rect } as HTMLElement) : undefined,
)
</script>

<template>
  <el-popover
    :visible="visible && !!rect"
    :virtual-ref="virtualRef"
    virtual-triggering
    placement="bottom"
    :width="340"
    popper-class="translation-popover"
  >
    <div class="max-h-96 overflow-y-auto" @pointerup.stop>
      <el-skeleton v-if="loading" :rows="3" animated />

      <el-alert v-else-if="error" :title="error" type="warning" :closable="false" />

      <template v-else-if="word">
        <!-- header -->
        <div class="mb-2 border-b border-gray-200 pb-2 dark:border-gray-700">
          <span class="text-lg font-bold">{{ word.word }}</span>
          <span v-if="word.transliteration" class="ml-2 text-sm text-gray-500">[{{ word.transliteration }}]</span>
          <span v-if="word.lemma && word.lemma !== word.word" class="ml-2 text-sm text-gray-500">→ {{ word.lemma }}</span>
        </div>

        <!-- in-context translation -->
        <div v-if="word.bestInContext" class="mb-3 rounded bg-blue-50 p-2 dark:bg-blue-950">
          <div class="font-semibold text-blue-700 dark:text-blue-300">{{ word.bestInContext.translation }}</div>
          <div class="text-xs text-gray-600 dark:text-gray-400">{{ word.bestInContext.explanation }}</div>
        </div>

        <!-- proper noun card -->
        <div v-if="word.entity" class="mb-3 flex gap-2 rounded border border-gray-200 p-2 dark:border-gray-700">
          <img
            v-if="word.entity.thumbnail"
            :src="word.entity.thumbnail"
            alt=""
            class="h-14 w-14 rounded object-cover"
          />
          <div class="min-w-0 text-sm">
            <div class="font-semibold">
              {{ word.entity.canonicalName }}
              <el-tag size="small" class="ml-1">{{ word.entity.type }}</el-tag>
            </div>
            <p class="mt-0.5 line-clamp-3 text-xs text-gray-600 dark:text-gray-400">{{ word.entity.summary }}</p>
            <a
              v-if="word.entity.link"
              :href="word.entity.link"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Read more on Wikipedia ↗
            </a>
          </div>
        </div>

        <!-- all meanings -->
        <ul v-if="word.meanings.length" class="mb-2 space-y-1.5">
          <li v-for="(meaning, i) in word.meanings" :key="i" class="text-sm">
            <span class="font-medium">{{ meaning.translation }}</span>
            <el-tag v-if="meaning.pos" size="small" type="info" class="ml-1.5">{{ meaning.pos }}</el-tag>
            <el-tag v-if="meaning.register" size="small" type="warning" class="ml-1">{{ meaning.register }}</el-tag>
            <span v-if="meaning.note" class="ml-1 text-xs text-gray-500">— {{ meaning.note }}</span>
          </li>
        </ul>

        <!-- sentence translation -->
        <div class="border-t border-gray-200 pt-2 dark:border-gray-700">
          <div v-if="sentence" class="text-sm">
            <p class="italic">{{ sentence.translation }}</p>
            <p v-if="sentence.notes" class="mt-1 text-xs text-gray-500">{{ sentence.notes }}</p>
          </div>
          <el-button v-else size="small" text type="primary" :loading="sentenceLoading" @click="emit('translateSentence')">
            Translate the whole sentence
          </el-button>
        </div>
      </template>
    </div>
  </el-popover>
</template>
