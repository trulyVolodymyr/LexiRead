import type { Book, BookChunk } from '~/types'
import { db } from '~/utils/offline/db'

const DOWNLOAD_PAGE = 50

const downloadedIds = ref<Set<string>>(new Set())
const downloadProgress = ref<Record<string, number>>({})

export function useOfflineBooks() {
  const supabase = useSupabaseClient()

  async function refreshDownloadedIds() {
    const keys = await db.books.toCollection().primaryKeys()
    downloadedIds.value = new Set(keys)
  }

  async function downloadBook(book: Book, coverUrl?: string) {
    downloadProgress.value[book.id] = 0
    try {
      // chunks, paged — never the whole book in one response
      for (let from = 0; from < book.chunk_count; from += DOWNLOAD_PAGE) {
        const { data, error } = await supabase
          .from('book_chunks')
          .select('chunk_index, chapter_index, char_start, char_count, content')
          .eq('book_id', book.id)
          .order('chunk_index')
          .range(from, Math.min(from + DOWNLOAD_PAGE - 1, book.chunk_count - 1))
        if (error) throw error
        await db.chunks.bulkPut(
          (data as Omit<BookChunk, 'book_id'>[]).map((c) => ({
            bookId: book.id,
            chunkIndex: c.chunk_index,
            chapterIndex: c.chapter_index,
            charStart: c.char_start,
            charCount: c.char_count,
            content: c.content,
          })),
        )
        downloadProgress.value[book.id] = Math.min(99, Math.round(((from + DOWNLOAD_PAGE) / book.chunk_count) * 100))
      }

      let coverBlob: Blob | null = null
      if (coverUrl) {
        try {
          coverBlob = await (await fetch(coverUrl)).blob()
        } catch {
          /* cover is optional offline */
        }
      }

      await db.books.put({
        id: book.id,
        title: book.title,
        author: book.author,
        language: book.language,
        format: book.format,
        chunkCount: book.chunk_count,
        charCount: book.char_count,
        toc: book.toc,
        coverBlob,
        downloadedAt: Date.now(),
      })
      downloadedIds.value = new Set([...downloadedIds.value, book.id])
      delete downloadProgress.value[book.id]
      return true
    } catch (err) {
      console.error('download failed', err)
      delete downloadProgress.value[book.id]
      await removeDownload(book.id)
      return false
    }
  }

  async function removeDownload(bookId: string) {
    await db.chunks.where('bookId').equals(bookId).delete()
    await db.books.delete(bookId)
    const next = new Set(downloadedIds.value)
    next.delete(bookId)
    downloadedIds.value = next
  }

  return { downloadedIds, downloadProgress, refreshDownloadedIds, downloadBook, removeDownload }
}
