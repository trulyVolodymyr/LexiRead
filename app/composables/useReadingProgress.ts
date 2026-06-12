import { db } from '~/utils/offline/db'

export interface Position {
  chunkIndex: number
  charOffset: number
  percent: number
}

/**
 * Offline-first progress: every save lands in Dexie marked dirty, then is
 * pushed to Supabase when online. Conflicts resolve last-write-wins by
 * updated_at on both ends.
 */
export function useReadingProgress() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  async function save(bookId: string, position: Position) {
    const updatedAt = Date.now()
    await db.progress.put({ bookId, ...position, updatedAt, dirty: 1 })
    if (navigator.onLine && user.value) {
      await pushOne(bookId, position, updatedAt)
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

  /** Local vs server, newest updated_at wins. Falls back gracefully offline. */
  async function load(bookId: string): Promise<Position | null> {
    const local = await db.progress.get(bookId)
    let remote: { chunk_index: number; char_offset: number; percent: number; updated_at: string } | null = null
    if (navigator.onLine && user.value) {
      const { data } = await supabase
        .from('reading_progress')
        .select('chunk_index, char_offset, percent, updated_at')
        .eq('book_id', bookId)
        .maybeSingle()
      remote = data
    }

    const remoteTime = remote ? new Date(remote.updated_at).getTime() : -1
    const localTime = local?.updatedAt ?? -1
    if (remoteTime < 0 && localTime < 0) return null
    if (remoteTime > localTime) {
      const position = {
        chunkIndex: remote!.chunk_index,
        charOffset: remote!.char_offset,
        percent: remote!.percent,
      }
      await db.progress.put({ bookId, ...position, updatedAt: remoteTime, dirty: 0 })
      return position
    }
    return { chunkIndex: local!.chunkIndex, charOffset: local!.charOffset, percent: local!.percent }
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
