import { FunctionsHttpError } from '@supabase/supabase-js'
import type { SentenceTranslation, WordTranslation } from '~/types'

export function useTranslation() {
  const supabase = useSupabaseClient()

  const loading = ref(false)
  const sentenceLoading = ref(false)
  const wordResult = ref<WordTranslation | null>(null)
  const sentenceResult = ref<SentenceTranslation | null>(null)
  const error = ref<string | null>(null)

  // session-level memo so re-clicking a word in the same sitting is instant
  const memo = new Map<string, WordTranslation>()

  async function translateWord(word: string, sentence: string, srcLang: string, tgtLang: string) {
    reset()
    if (!navigator.onLine) {
      error.value = 'Translation needs an internet connection.'
      return
    }
    const memoKey = `${srcLang}:${tgtLang}:${word.toLocaleLowerCase()}:${sentence}`
    const hit = memo.get(memoKey)
    if (hit) {
      wordResult.value = hit
      return
    }

    loading.value = true
    try {
      const { data, error: fnError } = await supabase.functions.invoke<WordTranslation>('translate', {
        body: { mode: 'word', word, sentence, srcLang, tgtLang },
      })
      if (fnError) throw fnError
      wordResult.value = data
      if (data) memo.set(memoKey, data)
    } catch (err) {
      error.value = await describeError(err)
    } finally {
      loading.value = false
    }
  }

  async function translateSentence(sentence: string, srcLang: string, tgtLang: string) {
    if (!navigator.onLine) {
      error.value = 'Translation needs an internet connection.'
      return
    }
    sentenceLoading.value = true
    try {
      const { data, error: fnError } = await supabase.functions.invoke<SentenceTranslation>('translate', {
        body: { mode: 'sentence', sentence, srcLang, tgtLang },
      })
      if (fnError) throw fnError
      sentenceResult.value = data
    } catch (err) {
      error.value = await describeError(err)
    } finally {
      sentenceLoading.value = false
    }
  }

  function reset() {
    wordResult.value = null
    sentenceResult.value = null
    error.value = null
  }

  return { loading, sentenceLoading, wordResult, sentenceResult, error, translateWord, translateSentence, reset }
}

async function describeError(err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json()
      if (body?.error === 'quota_exceeded') {
        return `Daily translation limit reached (${body.limit}). Resets at midnight UTC.`
      }
    } catch {
      /* fall through */
    }
  }
  return 'Translation failed. Please try again.'
}
