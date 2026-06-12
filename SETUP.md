# LexiRead — Complete Setup Guide

Follow these steps in order. Total time: ~20–30 minutes. At the end you'll have the app fully working: Google sign-in, book uploads, AI word translation, and offline reading.

**You will need:**
- A Google account (for both Supabase sign-up and the OAuth setup)
- An API key from one AI provider (Anthropic, Google AI, or OpenAI) — Step 5
- Node.js 20+ and this project (`cd ~/Desktop/lexiread`)

---

## Step 1 — Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in (GitHub or email).
2. Click **New project**:
   - **Name:** `lexiread` (anything works)
   - **Database password:** click *Generate a password* and **save it somewhere** — you'll need it once in Step 2.
   - **Region:** pick the one closest to you (e.g. `Central EU (Frankfurt)`).
3. Wait ~2 minutes while the project provisions.
4. Collect three values (keep this tab open):
   - **Project ref** — the short id in your project's URL: `https://supabase.com/dashboard/project/<PROJECT_REF>`
   - **Project URL** — Dashboard → **Settings** (gear icon) → **API** → *Project URL*, looks like `https://abcdefghij.supabase.co`
   - **Anon/publishable key** — same page, under *Project API keys*: copy the **`anon` `public`** key (in newer dashboards it's called the **publishable** key and starts with `sb_publishable_...`; either works).

## Step 2 — Apply the database schema

From the project folder:

```sh
cd ~/Desktop/lexiread

# 1. Log in — opens a browser window
npx supabase login

# 2. Connect this folder to your project (paste the DB password from Step 1 when asked)
npx supabase link --project-ref <PROJECT_REF>

# 3. Enable pg_cron BEFORE pushing (needed by the cleanup migration):
#    Dashboard → Database → Extensions → search "pg_cron" → toggle ON
#    (If you skip this, `db push` will fail on 0002_cron_cleanup.sql.)

# 4. Create all tables, policies, functions, and storage buckets
npx supabase db push
```

**Verify it worked:** Dashboard → **Table Editor** — you should see `profiles`, `books`, `book_chunks`, `reading_progress`, `translation_cache`, `usage_quotas`. Also **Storage** should show two private buckets: `book-files` and `book-covers`.

> If `db push` errors on pg_cron and you don't want the cleanup jobs yet, delete or rename `supabase/migrations/0002_cron_cleanup.sql` and push again — it only schedules nightly maintenance, nothing the app depends on.

## Step 3 — Create the Google OAuth client

This is what makes "Continue with Google" work.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → project picker (top left) → **New project** → name it `lexiread` → **Create**, then make sure it's selected.
2. **Configure the consent screen** (first time only): **APIs & Services → OAuth consent screen**
   - User type: **External** → Create.
   - App name: `LexiRead`; support email: your email; developer contact: your email. Save through the remaining screens (no scopes needed beyond the defaults).
   - Under **Audience**, either add your Gmail address as a **Test user**, or click **Publish app** (publishing avoids the 7-day token expiry of testing mode; for a personal app the "unverified app" warning is fine).
3. **Create the credentials**: **APIs & Services → Credentials → + Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `lexiread-web`
   - **Authorized JavaScript origins** — add both:
     - `http://localhost:3000`
     - `https://<PROJECT_REF>.supabase.co`
   - **Authorized redirect URIs** — add exactly one (this is Supabase's callback, NOT your app's):
     - `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   - Click **Create** and copy the **Client ID** and **Client secret**.

## Step 4 — Enable Google login in Supabase

1. Supabase Dashboard → **Authentication → Sign In / Providers** (older UI: *Providers*) → **Google**:
   - Toggle **Enable**.
   - Paste the **Client ID** and **Client secret** from Step 3.
   - Save.
2. **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000` (change to your production URL when you deploy).
   - **Redirect URLs** — add:
     - `http://localhost:3000/auth/callback`
     - (later, also `https://your-production-domain/auth/callback`)
3. Optional hygiene: on the providers page, leave **Email** disabled (or disable it) so Google is the only way in.

## Step 5 — Get an AI key and deploy the Edge Function

### 5a. Get an API key (pick ONE provider)

| Provider | Where | Secret name |
|---|---|---|
| **Claude (default, recommended)** | [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key | `ANTHROPIC_API_KEY` |
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `GEMINI_API_KEY` |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` |

You'll need to add a small amount of credit ($5 is plenty to start — a word lookup on Claude Haiku costs a fraction of a cent, and results are cached + quota-capped).

### 5b. Set the secrets

```sh
# for Claude (default — no AI_PROVIDER needed):
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# OR for Gemini:
npx supabase secrets set AI_PROVIDER=gemini GEMINI_API_KEY=...

# OR for OpenAI:
npx supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=sk-...
```

Optional extras (defaults shown):

```sh
npx supabase secrets set WORD_DAILY_LIMIT=500 SENTENCE_DAILY_LIMIT=100
# lock CORS to your app origin in production:
npx supabase secrets set APP_ORIGIN=https://your-production-domain
```

### 5c. Deploy the function

```sh
npx supabase functions deploy translate
```

> If the CLI complains about Docker not running, add `--use-api`:
> `npx supabase functions deploy translate --use-api`

**Verify:** Dashboard → **Edge Functions** → `translate` should be listed with *JWT verification: enabled* (that's the default — leave it on).

## Step 6 — Configure and run the app

```sh
cd ~/Desktop/lexiread
```

Edit `.env` (it currently has placeholders) and put in your real values from Step 1:

```ini
SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_KEY=<your anon / publishable key>
```

Then:

```sh
npm run dev
```

Open **http://localhost:3000** — you should land on the login page.

## Step 7 — Test the whole flow (5 minutes)

1. **Sign in** with Google → you should land on the (empty) library. *Verify:* Dashboard → Table Editor → `profiles` now has one row.
2. **Upload a book** — grab a free EPUB, e.g. from [standardebooks.org](https://standardebooks.org) or [gutenberg.org](https://www.gutenberg.org), click **Upload book**, drop the file, check title/author/language, **Add to library**. You'll be taken straight into the reader.
3. **Read & position** — scroll a few screens, hit the **Aa** button and change font size, reload the page: you should come back to the same paragraph.
4. **Word translation** — set your target language (Aa drawer → *Translate to*), then click any word: a popover shows the in-context translation + all meanings. Click a name (e.g. "London") — you should get a short summary with a Wikipedia link. Try **Translate the whole sentence**.
5. **Offline** — back in the library, hover the book → **⋯ → Download for offline**. Then DevTools → Network → set **Offline**, reload: the library shows the downloaded book and reading works (translation correctly says it needs a connection).

If all five pass, you're fully set up. 🎉

## Step 8 — Deploy to GitHub Pages

The repo ships with `.github/workflows/deploy.yml` — every push to `main` builds the site and publishes it to **https://trulyvolodymyr.github.io/LexiRead/**. Because `.env` is gitignored, the workflow reads the Supabase credentials from the repository's Actions secrets instead. One-time setup:

1. **Add the build secrets** — GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**. Create two secrets with the same names and values as your local `.env`:
   - `SUPABASE_URL` = `https://<PROJECT_REF>.supabase.co`
   - `SUPABASE_KEY` = your anon / publishable key

   (Both values are public by design — they're embedded in the deployed site anyway — but keeping them in secrets means the repo itself stays credential-free.)
2. **Enable Pages** — repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Supabase** — Dashboard → **Authentication → URL Configuration**:
   - **Site URL:** `https://trulyvolodymyr.github.io/LexiRead/`
   - **Redirect URLs** — add `https://trulyvolodymyr.github.io/LexiRead/auth/callback` (keep the localhost one for dev).
4. **Google OAuth** — usually **no change needed**: Google only ever redirects to Supabase's callback (`https://<PROJECT_REF>.supabase.co/auth/v1/callback`), which is already configured. Optionally add `https://trulyvolodymyr.github.io` to **Authorized JavaScript origins** in the Google Cloud console.
5. **Edge Function CORS** — if you set the `APP_ORIGIN` secret (Step 5b), update it to the new origin (no path): `npx supabase secrets set APP_ORIGIN=https://trulyvolodymyr.github.io`
6. Push to `main` (or run the workflow manually from the **Actions** tab) and wait for the *Deploy to GitHub Pages* run to go green.
7. Replace the placeholder icons `public/icon-192.png` / `public/icon-512.png` with real artwork so the installed PWA looks right.

> Prefer a different host (Cloudflare Pages, Netlify, Vercel)? Same recipe: set `SUPABASE_URL`/`SUPABASE_KEY` in the host's env, build command `npm run generate`, output dir `.output/public` — and skip `NUXT_APP_BASE_URL`, since those hosts serve from the domain root.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Google shows **`redirect_uri_mismatch`** | The redirect URI in Google Cloud must be exactly `https://<PROJECT_REF>.supabase.co/auth/v1/callback` — not your app's URL, no trailing slash. |
| Google shows **"access blocked / app not verified"** | Consent screen is in *Testing* and your account isn't a test user — add it under Audience → Test users, or Publish the app. |
| After Google login you bounce back to `/login` | `http://localhost:3000/auth/callback` is missing from Supabase **Redirect URLs**, or Site URL is wrong. |
| Word click says **"Translation failed"** | Edge Functions → `translate` → **Logs** in the dashboard. Usual causes: missing/typo'd API key secret (re-run `secrets set`, then redeploy), or no credit on the provider account. |
| Word click returns **401** | The function expects your JWT — make sure you're signed in; check that JWT verification wasn't disabled and that `SUPABASE_URL`/`SUPABASE_KEY` in `.env` belong to the same project the function is deployed to. |
| **"Daily translation limit reached"** | Working as designed (500 words/day). Raise it: `npx supabase secrets set WORD_DAILY_LIMIT=2000` (no redeploy needed — secrets apply on next invocation). |
| Upload fails immediately | Check Storage buckets `book-files`/`book-covers` exist (Step 2); check the browser console for the row-level-security error text. |
| `db push` fails on `0002_cron_cleanup.sql` | Enable the **pg_cron** extension first, or remove that migration (it's optional maintenance). |
| Books/covers don't load after sign-in | You edited `.env` while `npm run dev` was running — restart the dev server so the new env is picked up. |
