import DOMPurify from 'dompurify'

// Strict allowlist: structural + inline emphasis only. No attributes, no media.
// In-text images are deferred (the original file in Storage preserves them).
const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'blockquote',
  'em', 'strong', 'i', 'b', 'ul', 'ol', 'li',
  'br', 'hr', 'sup', 'sub', 'span',
]

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  })
}

export function escapeText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
