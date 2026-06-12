import JSZip from 'jszip'
import type { ParsedBook, ParsedChapter } from '~/types'
import { extractBlocks } from './dom'

/**
 * Raw EPUB extraction: unzip → container.xml → OPF → spine order → XHTML blocks.
 * (epub.js is a renderer; for normalized extraction we want direct control.)
 */
export async function parseEpub(buffer: ArrayBuffer): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(buffer)

  if (zip.file('META-INF/encryption.xml')) {
    throw new ParseError('This EPUB is DRM-protected and cannot be imported.')
  }

  const containerXml = await readFile(zip, 'META-INF/container.xml')
  const container = parseXml(containerXml)
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new ParseError('Invalid EPUB: missing OPF reference.')

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
  const opf = parseXml(await readFile(zip, opfPath))

  const title = textOf(opf, 'metadata > *|title') ?? textOf(opf, 'title') ?? 'Untitled'
  const author = textOf(opf, 'metadata > *|creator') ?? textOf(opf, 'creator')
  const language = textOf(opf, 'metadata > *|language') ?? textOf(opf, 'language')

  // manifest id → href/media-type/properties
  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>()
  opf.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) {
      manifest.set(id, {
        href,
        mediaType: item.getAttribute('media-type') ?? '',
        properties: item.getAttribute('properties') ?? '',
      })
    }
  })

  const chapters: ParsedChapter[] = []
  const spineIds = Array.from(opf.querySelectorAll('spine > itemref'))
    .filter((ref) => ref.getAttribute('linear') !== 'no')
    .map((ref) => ref.getAttribute('idref'))
    .filter((id): id is string => !!id)

  for (const id of spineIds) {
    const item = manifest.get(id)
    if (!item || !/x?html/.test(item.mediaType)) continue
    const path = resolvePath(opfDir, item.href)
    const file = zip.file(path)
    if (!file) continue

    const doc = new DOMParser().parseFromString(await file.async('text'), 'text/html')
    const body = doc.body
    if (!body) continue

    const blocks = extractBlocks(body)
    if (!blocks.length) continue

    const heading = body.querySelector('h1, h2, h3')?.textContent?.trim()
    chapters.push({ title: heading || doc.title?.trim() || null, blocks })
  }

  if (!chapters.length) throw new ParseError('No readable text found in this EPUB.')

  const coverBlob = await extractCover(zip, opf, opfDir, manifest)
  return { title, author: author ?? null, language: normalizeLang(language), chapters, coverBlob }
}

async function extractCover(
  zip: JSZip,
  opf: Document,
  opfDir: string,
  manifest: Map<string, { href: string; mediaType: string; properties: string }>,
): Promise<Blob | null> {
  let coverItem = Array.from(manifest.values()).find((i) => i.properties.includes('cover-image'))
  if (!coverItem) {
    const coverId = opf.querySelector('metadata > meta[name="cover"]')?.getAttribute('content')
    if (coverId) coverItem = manifest.get(coverId)
  }
  if (!coverItem || !coverItem.mediaType.startsWith('image/')) return null
  const file = zip.file(resolvePath(opfDir, coverItem.href))
  if (!file) return null
  const data = await file.async('arraybuffer')
  return new Blob([data], { type: coverItem.mediaType })
}

function readFile(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path)
  if (!file) throw new ParseError(`Invalid EPUB: missing ${path}`)
  return file.async('text')
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new ParseError('Invalid EPUB: malformed XML.')
  return doc
}

function textOf(doc: Document, selector: string): string | null {
  try {
    return doc.querySelector(selector)?.textContent?.trim() || null
  } catch {
    return null
  }
}

function resolvePath(baseDir: string, href: string): string {
  const url = new URL(href, `file:///${baseDir}`)
  return decodeURIComponent(url.pathname.slice(1))
}

function normalizeLang(lang: string | null): string | null {
  return lang ? lang.toLowerCase().split('-')[0] ?? null : null
}

export class ParseError extends Error {}
