import { db } from '~/utils/offline/db'

export interface Position {
  chunkIndex: number
  charOffset: number
  percent: number
  /** Viewport y-offset of the anchor char at save time — restores pixel-exact. Local only. */
  anchorY?: number
}

/**
 * Offline-first progress: every save lands in Dexie marked dirty, then is
 * pushed to Supabase when online. Conflicts resolve last-write-wins by
 * updated_at on both ends.
 */
export function useReadingProgress() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  const mirrorKey = (bookId: string) => `lexiread:pos:${bookId}`

  async function save(bookId: string, position: Position) {
    const updatedAt = Date.now()
    // Synchronous mirror first: async IndexedDB/network writes aren't
    // guaranteed to finish when the page is being unloaded.
    try {
      localStorage.setItem(mirrorKey(bookId), JSON.stringify({ ...position, updatedAt }))
    } catch {
      /* quota/private mode — Dexie still has it */
    }
    await db.progress.put({ bookId, ...position, updatedAt, dirty: 1 })
    if (navigator.onLine && user.value) {
      await pushOne(bookId, position, updatedAt)
    }
  }

  function readMirror(bookId: string): (Position & { updatedAt: number }) | null {
    try {
      const raw = localStorage.getItem(mirrorKey(bookId))
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (typeof parsed?.chunkIndex !== 'number' || typeof parsed?.updatedAt !== 'number') return null
      return parsed
    } catch {
      return null
    }
  }

  async function pushOne(bookId: string, position: Position, updatedAt: number) {
    const { error } = await supabase.from('reading_progress').upsert({
      user_id: user.value!.sub,
      book_id: bookId,
      chunk_index: position.chunkIndex,
      char_offset: position.charOffset,
      percent: position.percent,
      device_id: deviceId(),
      updated_at: new Date(updatedAt).toISOString(),
    })
    if (!error) await db.progress.update(bookId, { dirty: 0 })
  }

  /** Mirror vs Dexie vs server, newest updated_at wins. Falls back gracefully offline. */
  async function load(bookId: string): Promise<Position | null> {
    const local = await db.progress.get(bookId)
    const mirror = readMirror(bookId)
    let remote: { chunk_index: number; char_offset: number; percent: number; updated_at: string } | null = null
    if (navigator.onLine && user.value) {
      const { data } = await supabase
        .from('reading_progress')
        .select('chunk_index, char_offset, percent, updated_at')
        .eq('book_id', bookId)
        .maybeSingle()
      remote = data
    }

    const candidates: { position: Position; time: number; fromRemote: boolean }[] = []
    if (local) {
      candidates.push({
        position: { chunkIndex: local.chunkIndex, charOffset: local.charOffset, percent: local.percent, anchorY: local.anchorY },
        time: local.updatedAt,
        fromRemote: false,
      })
    }
    if (mirror) {
      candidates.push({
        position: { chunkIndex: mirror.chunkIndex, charOffset: mirror.charOffset, percent: mirror.percent, anchorY: mirror.anchorY },
        time: mirror.updatedAt,
        fromRemote: false,
      })
    }
    if (remote) {
      candidates.push({
        position: { chunkIndex: remote.chunk_index, charOffset: remote.char_offset, percent: remote.percent },
        time: new Date(remote.updated_at).getTime(),
        fromRemote: true,
      })
    }
    if (!candidates.length) return null

    const best = candidates.sort((a, b) => b.time - a.time)[0]!
    if (best.fromRemote) {
      await db.progress.put({ bookId, ...best.position, updatedAt: best.time, dirty: 0 })
    }
    return best.position
  }

  /** Push all dirty rows — call on app start and on the `online` event. */
  async function syncDirty() {
    if (!navigator.onLine || !user.value) return
    const dirty = await db.progress.where('dirty').equals(1).toArray()
    for (const row of dirty) {
      await pushOne(row.bookId, { chunkIndex: row.chunkIndex, charOffset: row.charOffset, percent: row.percent }, row.updatedAt)
    }
  }

  function deviceId(): string {
    let id = localStorage.getItem('lexiread:device')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('lexiread:device', id)
    }
    return id
  }

  return { save, load, syncDirty }
}
