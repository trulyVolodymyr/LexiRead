import { defineStore } from 'pinia'
import { DEFAULT_SETTINGS, type ReaderSettings } from '~/types'

const STORAGE_KEY = 'lexiread:settings'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS })
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  // localStorage gives instant boot (and works offline); the profile row syncs across devices.
  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) settings.value = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch {
      /* corrupted local settings — fall back to defaults */
    }
  }

  async function loadRemote() {
    if (!user.value) return
    const { data } = await supabase
      .from('profiles')
      .select('settings')
      .eq('id', user.value.sub)
      .maybeSingle()
    if (data?.settings && Object.keys(data.settings).length) {
      settings.value = { ...DEFAULT_SETTINGS, ...(data.settings as Partial<ReaderSettings>) }
    }
  }

  const persistRemote = useDebounceFn(async () => {
    if (!user.value || !navigator.onLine) return
    await supabase
      .from('profiles')
      .update({ settings: settings.value, updated_at: new Date().toISOString() })
      .eq('id', user.value.sub)
  }, 1500)

  watch(
    settings,
    (value) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      persistRemote()
      applyTheme(value.theme)
    },
    { deep: true },
  )

  function applyTheme(theme: ReaderSettings['theme']) {
    // One switch drives Element Plus dark vars and Tailwind's dark: variant.
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }

  async function init() {
    loadLocal()
    applyTheme(settings.value.theme)
    await loadRemote()
  }

  return { settings, init, applyTheme }
})
