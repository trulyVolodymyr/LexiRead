import type { ParsedChapter, PreparedChunk, TocEntry } from '~/types'

export const CHUNK_TARGET = 10_000
export const CHUNK_HARD_MAX = 20_000

interface ChunkResult {
  chunks: PreparedChunk[]
  toc: TocEntry[]
  charCount: number
}

/**
 * Splits chapters into chunks of ~CHUNK_TARGET plain-text chars.
 * Chunks never span chapters; splits happen only between blocks (an oversized
 * single block is split at sentence boundaries). chunk_index and char_start
 * are assigned once here and are stable for the life of the book.
 */
export function chunkBook(chapters: ParsedChapter[], language: string): ChunkResult {
  const chunks: PreparedChunk[] = []
  const toc: TocEntry[] = []
  let chunkIndex = 0
  let globalChar = 0

  chapters.forEach((chapter, chapterIndex) => {
    const blocks = chapter.blocks.flatMap((b) =>
      b.charCount > CHUNK_HARD_MAX ? splitOversizedBlock(b.html, language) : [b],
    )
    if (!blocks.length) return

    toc.push({
      title: chapter.title ?? `Chapter ${toc.length + 1}`,
      chunkIndex,
      charOffset: 0,
    })

    let buffer: string[] = []
    let bufferChars = 0

    const flush = () => {
      if (!buffer.length) return
      chunks.push({
        chunk_index: chunkIndex++,
        chapter_index: chapterIndex,
        char_start: globalChar,
        char_count: bufferChars,
        content: buffer.join('\n'),
      })
      globalChar += bufferChars
      buffer = []
      bufferChars = 0
    }

    for (const block of blocks) {
      if (bufferChars > 0 && bufferChars + block.charCount > CHUNK_TARGET) flush()
      buffer.push(block.html)
      bufferChars += block.charCount
      if (bufferChars >= CHUNK_HARD_MAX) flush()
    }
    flush()
  })

  return { chunks, toc, charCount: globalChar }
}

function splitOversizedBlock(html: string, language: string): { html: string; charCount: number }[] {
  const probe = document.createElement('div')
  probe.innerHTML = html
  const text = probe.textContent ?? ''

  const segmenter = new Intl.Segmenter(language || undefined, { granularity: 'sentence' })
  const parts: { html: string; charCount: number }[] = []
  let current = ''

  for (const { segment } of segmenter.segment(text)) {
    current += segment
    if (current.length >= CHUNK_TARGET) {
      parts.push(toParagraph(current))
      current = ''
    }
  }
  if (current.trim()) parts.push(toParagraph(current))
  // Inline markup inside a pathological 20k-char block is dropped — acceptable.
  return parts
}

function toParagraph(text: string): { html: string; charCount: number } {
  const trimmed = text.trim()
  return { html: `<p>${escapeText(trimmed)}</p>`, charCount: trimmed.length }
}

function escapeText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
