import JSZip from 'jszip'
import type { ParsedBook, ParsedChapter } from '~/types'
import { extractBlocks } from './dom'
import { ParseError } from './epub'

export async function parseFb2(buffer: ArrayBuffer, fileName: string): Promise<ParsedBook> {
  let xmlText: string
  if (fileName.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(buffer)
    const inner = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith('.fb2'))
    if (!inner) throw new ParseError('No .fb2 file inside the archive.')
    xmlText = await inner.async('text')
  } else {
    xmlText = decodeFb2(buffer)
  }

  const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
  if (doc.querySelector('parsererror')) throw new ParseError('Invalid FB2: malformed XML.')

  const titleInfo = doc.querySelector('description > title-info')
  const title = titleInfo?.querySelector('book-title')?.textContent?.trim() || 'Untitled'
  const firstName = titleInfo?.querySelector('author > first-name')?.textContent?.trim() ?? ''
  const lastName = titleInfo?.querySelector('author > last-name')?.textContent?.trim() ?? ''
  const author = `${firstName} ${lastName}`.trim() || null
  const language = titleInfo?.querySelector('lang')?.textContent?.trim().toLowerCase() || null

  const chapters: ParsedChapter[] = []
  // First body is the book; later bodies are usually notes/comments — skipped in v1.
  const body = doc.querySelector('body')
  if (!body) throw new ParseError('Invalid FB2: no body.')

  function walkSections(parent: Element) {
    const sections = Array.from(parent.children).filter((c) => c.localName === 'section')
    if (!sections.length) {
      const blocks = extractBlocks(parent)
      if (blocks.length) {
        chapters.push({ title: sectionTitle(parent), blocks })
      }
      return
    }
    for (const section of sections) walkSections(section)
  }
  walkSections(body)

  if (!chapters.length) throw new ParseError('No readable text found in this FB2.')

  const coverBlob = extractFb2Cover(doc)
  return { title, author, language, chapters, coverBlob }
}

function sectionTitle(section: Element): string | null {
  const title = Array.from(section.children).find((c) => c.localName === 'title')
  return title?.textContent?.trim().replace(/\s+/g, ' ') || null
}

function extractFb2Cover(doc: Document): Blob | null {
  const image = doc.querySelector('description coverpage image')
  const href =
    image?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ??
    image?.getAttribute('l:href') ??
    image?.getAttribute('href')
  if (!href?.startsWith('#')) return null
  const binary = doc.getElementById(href.slice(1)) ?? doc.querySelector(`binary[id="${CSS.escape(href.slice(1))}"]`)
  if (!binary) return null
  try {
    const bytes = Uint8Array.from(atob(binary.textContent?.replace(/\s/g, '') ?? ''), (c) => c.charCodeAt(0))
    return new Blob([bytes.buffer as ArrayBuffer], { type: binary.getAttribute('content-type') ?? 'image/jpeg' })
  } catch {
    return null
  }
}

/** FB2 files are frequently windows-1251; honor the XML declaration. */
function decodeFb2(buffer: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(buffer.slice(0, 200))
  const match = head.match(/encoding=["']([\w-]+)["']/i)
  const encoding = match?.[1]?.toLowerCase() ?? 'utf-8'
  try {
    return new TextDecoder(encoding).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}
