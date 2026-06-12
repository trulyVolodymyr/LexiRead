import { defineStore } from 'pinia'
import type { Book, ReadingProgress } from '~/types'

export const useLibraryStore = defineStore('library', () => {
  const supabase = useSupabaseClient()

  const books = ref<Book[]>([])
  const progressByBook = ref<Record<string, ReadingProgress>>({})
  const coverUrls = ref<Record<string, string>>({})
  const loading = ref(false)

  async function fetchLibrary() {
    loading.value = true
    try {
      const [{ data: bookRows }, { data: progressRows }] = await Promise.all([
        supabase.from('books').select('*').eq('status', 'ready').order('created_at', { ascending: false }),
        supabase.from('reading_progress').select('*'),
      ])
      books.value = (bookRows ?? []) as unknown as Book[]
      progressByBook.value = Object.fromEntries(
        ((progressRows ?? []) as ReadingProgress[]).map((p) => [p.book_id, p]),
      )
      await loadCoverUrls()
    } finally {
      loading.value = false
    }
  }

  // Signed URLs are memoized per session; covers are also CacheFirst in the SW.
  async function loadCoverUrls() {
    const paths = books.value
      .filter((b) => b.cover_path && !coverUrls.value[b.id])
      .map((b) => b.cover_path!)
    if (!paths.length) return
    const { data } = await supabase.storage.from('book-covers').createSignedUrls(paths, 3600)
    if (!data) return
    for (const book of books.value) {
      const signed = data.find((d) => d.path === book.cover_path)
      if (signed?.signedUrl) coverUrls.value[book.id] = signed.signedUrl
    }
  }

  async function deleteBook(bookId: string) {
    const book = books.value.find((b) => b.id === bookId)
    if (!book) return
    await supabase.from('books').delete().eq('id', bookId)
    const paths = [book.file_path, book.cover_path].filter(Boolean) as string[]
    if (paths.length) {
      await supabase.storage.from('book-files').remove([book.file_path])
      if (book.cover_path) await supabase.storage.from('book-covers').remove([book.cover_path])
    }
    books.value = books.value.filter((b) => b.id !== bookId)
  }

  return { books, progressByBook, coverUrls, loading, fetchLibrary, deleteBook }
})
