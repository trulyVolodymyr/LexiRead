# 📖 LexiRead

A PWA for reading books in any language with AI-assisted translation. Click any word while reading to get every meaning translated into your language — names get a short explanation with a Wikipedia link — or translate the whole sentence. Books are stored chunked (no endpoint ever returns a whole book), reading position syncs across devices, and downloaded books work fully offline (without AI).

**Stack:** Nuxt 4 (SPA mode) · Tailwind CSS v4 · Element Plus · Supabase (Postgres + RLS, Google auth, Storage, Edge Functions) · Dexie (IndexedDB) · pluggable AI provider (Claude / Gemini / OpenAI).

**Formats:** EPUB, FB2 (incl. `.fb2.zip`), TXT — parsed entirely in the browser at upload time.

---

## Setup

> **First time?** Follow the click-by-click walkthrough in **[SETUP.md](./SETUP.md)** — it covers every dashboard screen, the Google OAuth consent setup, verification steps, and troubleshooting. The condensed version is below.

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (or run locally with `supabase start`).
2. Apply the migrations:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push        # applies supabase/migrations/*
   ```
   > `0002_cron_cleanup.sql` needs the **pg_cron** extension — enable it first under Dashboard → Database → Extensions (or comment that migration out for now; it's only maintenance jobs).

### 2. Google OAuth

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials): create an **OAuth client ID** (type: Web application).
   - Authorized JavaScript origins: `http://localhost:3000` and your production URL.
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase Dashboard → Authentication → Providers → **Google**: enable it and paste the client ID + secret. Disable email/password and all other providers.
3. Authentication → URL Configuration: set **Site URL** to your app URL and add `http://localhost:3000/auth/callback` (and the production equivalent) to the redirect allowlist.

### 3. Edge Function (AI translation)

```sh
# secrets — pick a provider; claude is the default
npx supabase secrets set AI_PROVIDER=claude ANTHROPIC_API_KEY=sk-ant-...
# alternatives:
#   AI_PROVIDER=gemini GEMINI_API_KEY=...      (model default: gemini-2.5-flash)
#   AI_PROVIDER=openai OPENAI_API_KEY=...      (model default: gpt-4o-mini)
# optional: AI_MODEL=claude-haiku-4-5  APP_ORIGIN=https://your-app.example
#           WORD_DAILY_LIMIT=500 SENTENCE_DAILY_LIMIT=100

npx supabase functions deploy translate
```

The function verifies the caller's JWT, enforces per-user daily quotas atomically in SQL, caches every result (`translation_cache` — readable only by the service role), and resolves proper nouns through the Wikipedia REST API (target-language wiki first, then source, then English).

### 4. App

```sh
cp .env.example .env       # fill in SUPABASE_URL + SUPABASE_KEY (anon key)
npm install
npm run dev                # http://localhost:3000
```

Production build: `npm run build` → deploy `.output/public` to any static host (the app is a pure SPA + service worker). `npm run generate` works too.

---

## How it works

| Concern | Approach |
|---|---|
| **Upload** | Browser parses the file (jszip + DOMParser for EPUB, DOMParser for FB2, jschardet for TXT encodings), sanitizes with DOMPurify (strict tag allowlist, zero attributes), splits into ~10k-char chunks at block boundaries (never across chapters), then uploads: original file → Storage, cover (WebP ≤480px) → Storage, chunks → Postgres in batches of 50. Dedupe by per-user SHA-256. |
| **Reading** | A 3-chunk window `[prev, current, next]` in a scroll container; IntersectionObserver sentinels shift the window with manual `scrollTop` compensation. Chunks are fetched one at a time (Dexie first, then network) — never the whole book. |
| **Position** | `(chunk_index, char_offset)` into the chunk's plain text via TreeWalker — survives font/size/spacing changes. Saved debounced to IndexedDB (dirty flag) and pushed to `reading_progress`; conflicts resolve last-write-wins by `updated_at`. |
| **Word click** | `caretPositionFromPoint` + `Intl.Segmenter` (word + sentence granularity, correct for CJK) over the block's text — no per-word spans. Highlight via the CSS Custom Highlight API. The popover is an `el-popover` in virtual-triggering mode anchored to the word's Range rect. |
| **Offline** | `@vite-pwa/nuxt` precaches the app shell; Supabase API calls are NetworkOnly (never SW-cached). "Download" pulls all chunks into IndexedDB 50 at a time. AI translation requires a connection by design. |
| **Security** | RLS default-deny on every table; cache/quota tables have no client policies at all. Private storage buckets with folder-ownership policies. Book HTML sanitized twice (upload + render). Provider API keys only in Edge Function secrets. |

## Project layout

```
app/
  pages/            index (library) · upload · read/[id] · settings · login · auth/callback
  components/       reader/ (Viewport, ChunkRenderer, TranslationPopover, drawers) · library/
  composables/      useBookUpload · useChunks · useReadingProgress · useWordSelection ·
                    useTranslation · useOfflineBooks
  stores/           settings · library          (Pinia)
  utils/            parsers/ (epub, fb2, txt, chunker, sanitize) · reader/position · offline/db
supabase/
  migrations/       0001_init.sql (schema + RLS + quotas) · 0002_cron_cleanup.sql
  functions/        translate/ + _shared/ (provider adapters, Wikipedia, contract)
```

## Known v1 limitations

- PDF and MOBI/AZW3 are not supported yet (PDF reflow and MOBI parsing are planned phases).
- In-text images are stripped from the reading view (the original file in Storage preserves them).
- Per-word translation cache is keyed by word + exact sentence; the same word in a *new* sentence is a fresh (quota-counted) lookup.
- Large file uploads use the standard Storage endpoint; TUS resumable uploads are a planned hardening step.
- PWA icons in `public/` are generated placeholders — replace with real artwork.
