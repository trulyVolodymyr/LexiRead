import { caretFromPoint, charOffsetOf } from '~/utils/reader/position'

export interface WordSelection {
  word: string
  /** just the sentence containing the word — what "translate the sentence" should send */
  sentence: string
  /** previous sentence + containing sentence, capped at 600 chars — context for the word lookup */
  context: string
  rect: DOMRect
}

const MAX_CONTEXT = 600
const HIGHLIGHT_NAME = 'selected-word'

/**
 * Word detection without per-word <span>s: caret hit-test + Intl.Segmenter
 * over the containing block's textContent (handles words split across inline
 * tags, and CJK/Thai where there are no spaces). Highlight via the CSS Custom
 * Highlight API — zero DOM mutation.
 */
export function useWordSelection() {
  function selectWordAt(x: number, y: number, contentRoot: HTMLElement, lang: string): WordSelection | null {
    const caret = caretFromPoint(x, y)
    if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !contentRoot.contains(caret.node)) return null

    const block = caret.node.parentElement?.closest('p, li, blockquote, h1, h2, h3, h4')
    if (!block) return null

    const blockText = block.textContent ?? ''
    const offsetInBlock = charOffsetOf(block, caret.node, caret.offset)

    // word boundaries
    let word = ''
    let wordStart = -1
    for (const seg of new Intl.Segmenter(lang || undefined, { granularity: 'word' }).segment(blockText)) {
      const end = seg.index + seg.segment.length
      if (seg.index <= offsetInBlock && offsetInBlock <= end) {
        if (!seg.isWordLike) return null
        word = seg.segment
        wordStart = seg.index
        break
      }
    }
    if (!word || wordStart < 0) return null

    // sentence context: previous sentence + containing sentence
    let sentence = blockText
    let previous = ''
    for (const seg of new Intl.Segmenter(lang || undefined, { granularity: 'sentence' }).segment(blockText)) {
      if (seg.index <= wordStart && wordStart < seg.index + seg.segment.length) {
        sentence = seg.segment
        break
      }
      previous = seg.segment
    }
    const own = sentence.trim().slice(0, MAX_CONTEXT)
    let context = `${previous}${sentence}`.trim()
    if (context.length > MAX_CONTEXT) context = own

    const range = rangeForTextSpan(block, wordStart, wordStart + word.length)
    if (range) {
      highlight(range)
      return { word, sentence: own, context, rect: range.getBoundingClientRect() }
    }
    return { word, sentence: own, context, rect: new DOMRect(x, y, 1, 1) }
  }

  function highlight(range: Range) {
    if ('highlights' in CSS) {
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range))
    } else {
      // fallback for browsers without the Custom Highlight API
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }

  function clearHighlight() {
    if ('highlights' in CSS) CSS.highlights.delete(HIGHLIGHT_NAME)
    else window.getSelection()?.removeAllRanges()
  }

  return { selectWordAt, clearHighlight }
}

/** Map plain-text [start, end) within block to a DOM Range. */
function rangeForTextSpan(block: Element, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let total = 0
  let startSet = false
  let node: Node | null = walker.nextNode()
  while (node) {
    const len = node.textContent?.length ?? 0
    if (!startSet && total + len > start) {
      range.setStart(node, start - total)
      startSet = true
    }
    if (startSet && total + len >= end) {
      range.setEnd(node, Math.min(end - total, len))
      return range
    }
    total += len
    node = walker.nextNode()
  }
  return null
}
