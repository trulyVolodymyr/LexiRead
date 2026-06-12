import Dexie, { type Table } from 'dexie'
import type { BookFormat, TocEntry } from '~/types'

export interface OfflineBook {
  id: string
  title: string
  author: string | null
  language: string
  format: BookFormat
  chunkCount: number
  charCount: number
  toc: TocEntry[]
  coverBlob: Blob | null
  downloadedAt: number
}

export interface OfflineChunk {
  bookId: string
  chunkIndex: number
  chapterIndex: number
  charStart: number
  charCount: number
  content: string
}

export interface LocalProgress {
  bookId: string
  chunkIndex: number
  charOffset: number
  percent: number
  updatedAt: number
  dirty: number // 0|1 — Dexie can't index booleans
}

class ReaderDB extends Dexie {
  books!: Table<OfflineBook, string>
  chunks!: Table<OfflineChunk, [string, number]>
  progress!: Table<LocalProgress, string>

  constructor() {
    super('lexiread')
    this.version(1).stores({
      books: 'id, downloadedAt',
      chunks: '[bookId+chunkIndex], bookId',
      progress: 'bookId, dirty',
    })
  }
}

export const db = new ReaderDB()
