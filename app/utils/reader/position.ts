/**
 * Reading position = char offset into a chunk's plain text. Anchoring to text
 * content (not layout) is what lets the position survive font/size/spacing
 * changes and chunk-window shifts.
 */

export function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y)
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null
  }
  const range = document.caretRangeFromPoint?.(x, y)
  return range ? { node: range.startContainer, offset: range.startOffset } : null
}

/** Plain-text offset of (node, nodeOffset) within root. */
export function charOffsetOf(root: Element, node: Node, nodeOffset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let current: Node | null = walker.nextNode()
  while (current) {
    if (current === node) return total + nodeOffset
    total += current.textContent?.length ?? 0
    current = walker.nextNode()
  }
  // node not a text node inside root (e.g. element) — best effort
  return node.contains?.(root) ? 0 : total
}

/** Range positioned at a plain-text offset within root. */
export function rangeAtCharOffset(root: Element, charOffset: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let current: Node | null = walker.nextNode()
  while (current) {
    const len = current.textContent?.length ?? 0
    if (total + len >= charOffset) {
      const range = document.createRange()
      const local = Math.max(0, Math.min(charOffset - total, len))
      range.setStart(current, local)
      range.collapse(true)
      return range
    }
    total += len
    current = walker.nextNode()
  }
  return null
}

/**
 * Scroll container so the char offset within root sits at the top.
 *
 * content-visibility:auto sizes unrendered chunks at a placeholder height
 * until a rendering frame runs, so a scroll computed right after mount clamps
 * against a bogus scrollHeight and silently lands at the chunk top. Forcing
 * real layout on the target chunk for the duration of the measurement makes
 * the math exact and synchronous; the loop re-verifies once since the first
 * correction can itself reflow neighbors.
 */
export function scrollToCharOffset(container: HTMLElement, root: HTMLElement, charOffset: number) {
  const previous = root.style.contentVisibility
  root.style.contentVisibility = 'visible'
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const target = rangeAtCharOffset(root, charOffset)?.getBoundingClientRect()
      if (!target || (target.top === 0 && target.height === 0)) {
        root.scrollIntoView()
        return
      }
      const delta = target.top - container.getBoundingClientRect().top - 8
      if (Math.abs(delta) <= 1) return
      container.scrollTop += delta
    }
  } finally {
    // Reverting to auto right away re-collapses the chunk to its placeholder
    // size on the next layout, and the browser clamps scrollTop back to ~0 —
    // silently undoing the restore. Revert only after a rendering frame: by
    // then the chunk intersects the viewport, so auto keeps it expanded.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        root.style.contentVisibility = previous
      }),
    )
  }
}

/** First visible text position at the top of the scroll container. */
export function topVisiblePosition(container: HTMLElement): { node: Node; offset: number } | null {
  const rect = container.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  // probe a few y positions in case the top edge lands on margin/whitespace
  for (const dy of [8, 24, 48, 96]) {
    const caret = caretFromPoint(x, rect.top + dy)
    if (caret && caret.node.nodeType === Node.TEXT_NODE && container.contains(caret.node)) {
      return caret
    }
  }
  return null
}
