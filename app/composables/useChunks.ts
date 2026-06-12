import type { BookChunk } from '~/types'
import { db } from '~/utils/offline/db'

const LRU_MAX = 12

export interface LoadedChunk {
  index: number
  chapterIndex: number
  charStart: number
  charCount: number
  content: string
}

/** Chunk fetching: Dexie first (downloaded books work offline), then network, with a small in-memory LRU. */
export function useChunks(bookId: string) {
  const supabase = useSupabaseClient()
  const lru = new Map<number, LoadedChunk>()

  async function getChunk(index: number): Promise<LoadedChunk | null> {
    const hit = lru.get(index)
    if (hit) {
      lru.delete(index)
      lru.set(index, hit)
      return hit
    }

    let chunk: LoadedChunk | null = null

    const local = await db.chunks.get([bookId, index])
    if (local) {
      chunk = {
        index,
        chapterIndex: local.chapterIndex,
        charStart: local.charStart,
        charCount: local.charCount,
        content: local.content,
      }
    } else if (navigator.onLine) {
      const { data } = await supabase
        .from('book_chunks')
        .select('chunk_index, chapter_index, char_start, char_count, content')
        .eq('book_id', bookId)
        .eq('chunk_index', index)
        .maybeSingle()
      if (data) {
        const row = data as Omit<BookChunk, 'book_id'>
        chunk = {
          index,
          chapterIndex: row.chapter_index,
          charStart: row.char_start,
          charCount: row.char_count,
          content: row.content,
        }
      }
    }

    if (chunk) {
      lru.set(index, chunk)
      if (lru.size > LRU_MAX) lru.delete(lru.keys().next().value!)
    }
    return chunk
  }

  return { getChunk }
}
