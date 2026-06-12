import type { ParsedBlock } from '~/types'
import { sanitizeHtml } from './sanitize'

const BLOCK_MAP: Record<string, string> = {
  p: 'p',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h4',
  h6: 'h4',
  blockquote: 'blockquote',
  ul: 'ul',
  ol: 'ol',
  hr: 'hr',
  subtitle: 'h3', // FB2
}

const CONTAINER_TAGS = new Set(['div', 'section', 'article', 'main', 'body', 'epigraph', 'poem', 'cite', 'annotation'])

/**
 * Flattens an element tree (EPUB XHTML body, FB2 section, …) into a list of
 * sanitized block elements. Containers are recursed into; loose inline
 * content directly inside a container is wrapped in a <p>.
 */
export function extractBlocks(root: Element): ParsedBlock[] {
  const blocks: ParsedBlock[] = []
  let pendingInline = ''

  function flushInline() {
    const text = pendingInline.trim()
    pendingInline = ''
    if (text) pushBlock('p', text)
  }

  function pushBlock(tag: string, innerHtml: string) {
    const html = sanitizeHtml(`<${tag}>${innerHtml}</${tag}>`)
    const probe = document.createElement('div')
    probe.innerHTML = html
    const charCount = (probe.textContent ?? '').length
    if (tag === 'hr' || charCount > 0) blocks.push({ html, charCount })
  }

  function walk(el: Element) {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        pendingInline += node.textContent ?? ''
        continue
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      const child = node as Element
      const tag = child.localName.toLowerCase()

      if (BLOCK_MAP[tag]) {
        flushInline()
        pushBlock(BLOCK_MAP[tag], child.innerHTML)
      } else if (tag === 'hr' || tag === 'empty-line') {
        flushInline()
        pushBlock('hr', '')
      } else if (CONTAINER_TAGS.has(tag)) {
        flushInline()
        walk(child)
      } else if (tag === 'img' || tag === 'image' || tag === 'svg' || tag === 'figure' || tag === 'table') {
        // dropped in v1 — original file keeps them
        flushInline()
      } else {
        // unknown inline tag (a, i, span, …): keep its inner content inline
        pendingInline += child.outerHTML
      }
    }
  }

  walk(root)
  flushInline()
  return blocks
}
