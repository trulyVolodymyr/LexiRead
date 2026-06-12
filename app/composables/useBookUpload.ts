import type { Book, ParsedBook, PreparedChunk, TocEntry } from '~/types'
import type { Json } from '~/types/database.types'
import { chunkBook } from '~/utils/parsers/chunker'
import { ParseError, parseBookFile } from '~/utils/parsers'
import { sha256Hex } from '~/utils/hash'
import { toWebpCover } from '~/utils/cover'

const CHUNK_INSERT_BATCH = 50

export type UploadStage = 'idle' | 'parsing' | 'confirm' | 'uploading' | 'done'

export function useBookUpload() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  const stage = ref<UploadStage>('idle')
  const error = ref<string | null>(null)
  const progress = ref(0)
  const existingBookId = ref<string | null>(null)

  // editable metadata shown on the confirmation card
  const meta = reactive({ title: '', author: '', language: 'en' })
  const coverPreviewUrl = ref<string | null>(null)

  let file: File | null = null
  let fileHash = ''
  let format: Book['format'] = 'txt'
  let parsed: ParsedBook | null = null
  let prepared: { chunks: PreparedChunk[]; toc: TocEntry[]; charCount: number } | null = null

  async function parse(selected: File) {
    reset()
    stage.value = 'parsing'
    file = selected
    try {
      fileHash = await sha256Hex(await selected.arrayBuffer())

      const { data: duplicate } = await supabase
        .from('books')
        .select('id, status')
        .eq('user_id', user.value!.sub)
        .eq('file_hash', fileHash)
        .maybeSingle()
      if (duplicate && duplicate.status !== 'failed') {
        existingBookId.value = duplicate.id
        stage.value = 'idle'
        return
      }

      const result = await parseBookFile(selected)
      format = result.format
      parsed = result.parsed
      prepared = chunkBook(parsed.chapters, parsed.language ?? 'en')

      meta.title = parsed.title
      meta.author = parsed.author ?? ''
      meta.language = parsed.language ?? 'en'
      if (parsed.coverBlob) coverPreviewUrl.value = URL.createObjectURL(parsed.coverBlob)

      stage.value = 'confirm'
    } catch (err) {
      stage.value = 'idle'
      error.value = err instanceof ParseError ? err.message : 'Could not read this file.'
      console.error(err)
    }
  }

  async function upload(): Promise<string | null> {
    if (!file || !parsed || !prepared || !user.value) return null
    stage.value = 'uploading'
    progress.value = 0
    const userId = user.value.sub
    let bookId: string | null = null

    try {
      const { data: book, error: insertError } = await supabase
        .from('books')
        .insert({
          user_id: userId,
          title: meta.title.trim() || 'Untitled',
          author: meta.author.trim() || null,
          language: meta.language,
          format,
          file_hash: fileHash,
          file_path: 'pending',
          chunk_count: prepared.chunks.length,
          char_count: prepared.charCount,
          toc: prepared.toc as unknown as Json,
          status: 'uploading',
        })
        .select('id')
        .single()
      if (insertError) throw insertError
      const newBookId: string = book.id
      bookId = newBookId

      // 1. original file (kept for future re-parse / export; images live here)
      const ext = file.name.split('.').pop() ?? format
      const filePath = `${userId}/${newBookId}/original.${ext}`
      const { error: fileError } = await supabase.storage.from('book-files').upload(filePath, file)
      if (fileError) throw fileError
      progress.value = 10

      // 2. cover
      let coverPath: string | null = null
      if (parsed.coverBlob) {
        const webp = await toWebpCover(parsed.coverBlob)
        if (webp) {
          coverPath = `${userId}/${newBookId}/cover.webp`
          const { error: coverError } = await supabase.storage
            .from('book-covers')
            .upload(coverPath, webp, { contentType: 'image/webp' })
          if (coverError) coverPath = null // cover is optional — don't fail the upload
        }
      }
      progress.value = 15

      // 3. chunks, batched
      const rows = prepared.chunks.map((c) => ({ ...c, book_id: newBookId }))
      for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
        const { error: chunkError } = await supabase
          .from('book_chunks')
          .insert(rows.slice(i, i + CHUNK_INSERT_BATCH))
        if (chunkError) throw chunkError
        progress.value = 15 + Math.round(((i + CHUNK_INSERT_BATCH) / rows.length) * 80)
      }

      // 4. finalize
      const { error: updateError } = await supabase
        .from('books')
        .update({ file_path: filePath, cover_path: coverPath, status: 'ready' })
        .eq('id', newBookId)
      if (updateError) throw updateError

      progress.value = 100
      stage.value = 'done'
      return newBookId
    } catch (err) {
      console.error(err)
      error.value = 'Upload failed. Please try again.'
      stage.value = 'confirm'
      // best-effort cleanup; abandoned rows are also swept by pg_cron
      if (bookId) await supabase.from('books').delete().eq('id', bookId)
      return null
    }
  }

  function reset() {
    stage.value = 'idle'
    error.value = null
    progress.value = 0
    existingBookId.value = null
    if (coverPreviewUrl.value) URL.revokeObjectURL(coverPreviewUrl.value)
    coverPreviewUrl.value = null
    file = null
    parsed = null
    prepared = null
  }

  return { stage, error, progress, meta, coverPreviewUrl, existingBookId, parse, upload, reset }
}
