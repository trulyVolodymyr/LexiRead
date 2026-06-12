import { detect } from 'tinyld'
import type { BookFormat, ParsedBook } from '~/types'
import { ParseError, parseEpub } from './epub'
import { parseFb2 } from './fb2'
import { parseTxt } from './txt'

export { ParseError }

export function detectFormat(fileName: string): BookFormat | null {
  const name = fileName.toLowerCase()
  if (name.endsWith('.epub')) return 'epub'
  if (name.endsWith('.fb2') || name.endsWith('.fb2.zip')) return 'fb2'
  if (name.endsWith('.txt')) return 'txt'
  return null
}

export async function parseBookFile(file: File): Promise<{ format: BookFormat; parsed: ParsedBook }> {
  const format = detectFormat(file.name)
  if (!format) {
    throw new ParseError('Unsupported format. Supported: EPUB, FB2, TXT (PDF and MOBI are coming later).')
  }

  const buffer = await file.arrayBuffer()
  let parsed: ParsedBook
  switch (format) {
    case 'epub':
      parsed = await parseEpub(buffer)
      break
    case 'fb2':
      parsed = await parseFb2(buffer, file.name)
      break
    case 'txt':
      parsed = parseTxt(buffer, file.name)
      break
  }

  if (!parsed.language) {
    parsed.language = detectLanguage(parsed)
  }
  return { format, parsed }
}

function detectLanguage(parsed: ParsedBook): string {
  const probe = document.createElement('div')
  let sample = ''
  outer: for (const chapter of parsed.chapters) {
    for (const block of chapter.blocks) {
      probe.innerHTML = block.html
      sample += `${probe.textContent ?? ''} `
      if (sample.length > 5000) break outer
    }
  }
  try {
    return detect(sample) || 'en'
  } catch {
    return 'en'
  }
}
