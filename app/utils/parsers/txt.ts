import jschardet from 'jschardet'
import type { ParsedBlock, ParsedBook, ParsedChapter } from '~/types'
import { escapeText } from './sanitize'
import { ParseError } from './epub'

const CHAPTER_RE = /^(chapter|part|глава|розділ|часть|частина|kapitel|chapitre|capítulo|第.{1,4}[章话話回])\b/i

export function parseTxt(buffer: ArrayBuffer, fileName: string): ParsedBook {
  const text = decode(buffer)
  if (!text.trim()) throw new ParseError('The file is empty.')

  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)

  const chapters: ParsedChapter[] = []
  let current: ParsedChapter = { title: null, blocks: [] }

  const isHeading = (p: string) =>
    p.length < 80 && (CHAPTER_RE.test(p) || (/^[^a-zа-яіїє]+$/u.test(p) && /\p{Lu}/u.test(p)))

  for (const para of paragraphs) {
    if (isHeading(para) && current.blocks.length) {
      chapters.push(current)
      current = { title: para, blocks: [headingBlock(para)] }
      continue
    }
    if (isHeading(para) && !current.blocks.length) {
      current.title = current.title ?? para
      current.blocks.push(headingBlock(para))
      continue
    }
    current.blocks.push(paragraphBlock(para))
  }
  if (current.blocks.length) chapters.push(current)

  return {
    title: fileName.replace(/\.txt$/i, ''),
    author: null,
    language: null, // detected later from a sample
    chapters,
    coverBlob: null,
  }
}

function paragraphBlock(text: string): ParsedBlock {
  return { html: `<p>${escapeText(text)}</p>`, charCount: text.length }
}

function headingBlock(text: string): ParsedBlock {
  return { html: `<h2>${escapeText(text)}</h2>`, charCount: text.length }
}

function decode(buffer: ArrayBuffer): string {
  const sample = new Uint8Array(buffer.slice(0, 64 * 1024))
  let binary = ''
  for (const byte of sample) binary += String.fromCharCode(byte)
  const detected = jschardet.detect(binary)
  const encoding = detected.confidence > 0.8 ? detected.encoding : 'utf-8'
  try {
    return new TextDecoder(encoding).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}
