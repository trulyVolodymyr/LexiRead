export type BookFormat = 'epub' | 'fb2' | 'txt'
export type BookStatus = 'uploading' | 'ready' | 'failed'
export type ReaderTheme = 'light' | 'sepia' | 'dark'

export interface TocEntry {
  title: string
  chunkIndex: number
  charOffset: number
}

export interface Book {
  id: string
  user_id: string
  title: string
  author: string | null
  language: string
  format: BookFormat
  file_hash: string
  file_path: string
  cover_path: string | null
  chunk_count: number
  char_count: number
  toc: TocEntry[]
  status: BookStatus
  created_at: string
}

export interface BookChunk {
  book_id: string
  chunk_index: number
  chapter_index: number
  char_start: number
  char_count: number
  content: string
}

export interface ReadingProgress {
  user_id: string
  book_id: string
  chunk_index: number
  char_offset: number
  percent: number
  updated_at: string
}

export interface ReaderSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  theme: ReaderTheme
  marginsPct: number
  targetLang: string
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: 'Georgia, serif',
  fontSize: 18,
  lineHeight: 1.7,
  theme: 'light',
  marginsPct: 8,
  targetLang: 'en',
}

// ---- translation contract (mirrors supabase/functions/_shared/contract.ts)

export interface WordMeaning {
  translation: string
  pos: string | null
  register: string | null
  note: string | null
}

export interface EntityInfo {
  canonicalName: string
  type: 'person' | 'place' | 'work' | 'organization' | 'other'
  summary: string
  link: string | null
  thumbnail: string | null
}

export interface WordTranslation {
  mode: 'word'
  word: string
  lemma: string
  transliteration: string | null
  isProperNoun: boolean
  meanings: WordMeaning[]
  bestInContext: { translation: string; explanation: string }
  entity: EntityInfo | null
  cached: boolean
  provider: string
}

export interface SentenceTranslation {
  mode: 'sentence'
  translation: string
  notes: string | null
  cached: boolean
  provider: string
}

// ---- parsing pipeline

export interface ParsedBlock {
  /** sanitized HTML of one block element */
  html: string
  /** plain text length of the block */
  charCount: number
}

export interface ParsedChapter {
  title: string | null
  blocks: ParsedBlock[]
}

export interface ParsedBook {
  title: string
  author: string | null
  language: string | null
  chapters: ParsedChapter[]
  coverBlob: Blob | null
}

export interface PreparedChunk {
  chunk_index: number
  chapter_index: number
  char_start: number
  char_count: number
  content: string
}
