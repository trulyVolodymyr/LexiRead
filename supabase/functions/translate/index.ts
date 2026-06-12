import { createClient } from 'npm:@supabase/supabase-js@2'
import { SentenceResponse, TranslateRequest, WordResponse } from '../_shared/contract.ts'
import { getProvider } from '../_shared/providers/index.ts'

const WORD_DAILY_LIMIT = Number(Deno.env.get('WORD_DAILY_LIMIT') ?? 500)
const SENTENCE_DAILY_LIMIT = Number(Deno.env.get('SENTENCE_DAILY_LIMIT') ?? 100)
const MAX_SENTENCE_CHARS = 1000

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function cacheGet(key: string): Promise<unknown | null> {
  const { data } = await admin.from('translation_cache').select('response, hit_count').eq('cache_key', key).maybeSingle()
  if (data) {
    // fire-and-forget hit counter — best effort, never blocks the response
    admin
      .from('translation_cache')
      .update({ hit_count: (data.hit_count ?? 0) + 1 })
      .eq('cache_key', key)
      .then(() => {}, () => {})
  }
  return data?.response ?? null
}

async function cachePut(
  key: string,
  mode: 'word' | 'sentence',
  req: { srcLang: string; tgtLang: string },
  provider: string,
  response: unknown,
): Promise<void> {
  await admin.from('translation_cache').upsert({
    cache_key: key,
    src_lang: req.srcLang,
    tgt_lang: req.tgtLang,
    mode,
    response,
    provider,
  })
}

function normalizeWord(word: string): string {
  return word.normalize('NFC').toLocaleLowerCase()
}

function validate(body: TranslateRequest): string | null {
  if (body.mode !== 'word' && body.mode !== 'sentence') return 'mode must be "word" or "sentence"'
  if (!body.sentence || typeof body.sentence !== 'string') return 'sentence is required'
  if (body.sentence.length > MAX_SENTENCE_CHARS) return `sentence exceeds ${MAX_SENTENCE_CHARS} chars`
  if (body.mode === 'word' && (!body.word || body.word.length > 100)) return 'word is required (max 100 chars)'
  if (!body.srcLang || !body.tgtLang) return 'srcLang and tgtLang are required'
  if (body.srcLang.length > 20 || body.tgtLang.length > 20) return 'invalid language codes'
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // verify_jwt is on for this function, but resolve the user explicitly for quotas
  const authHeader = req.headers.get('authorization') ?? ''
  const { data: userData, error: authError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const userId = userData.user.id

  let body: TranslateRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const validationError = validate(body)
  if (validationError) return json({ error: 'invalid_request', detail: validationError }, 400)

  const provider = getProvider()

  try {
    if (body.mode === 'sentence') {
      const key = await sha256(`sentence:${body.srcLang}:${body.tgtLang}:${body.sentence.normalize('NFC')}`)
      const cached = await cacheGet(key)
      if (cached) return json({ ...(cached as object), mode: 'sentence', cached: true })

      const allowed = await checkQuota(userId, 'sentence', SENTENCE_DAILY_LIMIT)
      if (!allowed) return quotaExceeded(SENTENCE_DAILY_LIMIT)

      const result = await provider.sentenceTranslate(body)
      const response: SentenceResponse = { ...result, mode: 'sentence', cached: false, provider: provider.name }
      await cachePut(key, 'sentence', body, provider.name, { ...result, provider: provider.name })
      return json(response)
    }

    // mode === 'word'
    const norm = normalizeWord(body.word!)
    const sentenceHash = await sha256(body.sentence.normalize('NFC'))
    const key = await sha256(`word:${body.srcLang}:${body.tgtLang}:${norm}:${sentenceHash}`)
    const cached = await cacheGet(key)
    if (cached) return json({ ...(cached as object), mode: 'word', cached: true })

    const allowed = await checkQuota(userId, 'word', WORD_DAILY_LIMIT)
    if (!allowed) return quotaExceeded(WORD_DAILY_LIMIT)

    const model = await provider.wordLookup(body)

    const response: WordResponse = {
      ...model,
      mode: 'word',
      word: body.word!,
      entity: null,
      cached: false,
      provider: provider.name,
    }
    const { cached: _c, ...toCache } = response
    await cachePut(key, 'word', body, provider.name, toCache)
    return json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    if (message === 'provider_refused') return json({ error: 'provider_refused' }, 422)
    console.error('translate error:', message)
    return json({ error: 'translation_failed' }, 502)
  }
})

async function checkQuota(userId: string, kind: 'word' | 'sentence', limit: number): Promise<boolean> {
  const { data, error } = await admin.rpc('increment_usage', {
    p_user: userId,
    p_kind: kind,
    p_limit: limit,
  })
  if (error) {
    console.error('quota check failed:', error.message)
    return false
  }
  return data === true
}

function quotaExceeded(limit: number): Response {
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  tomorrow.setUTCHours(0, 0, 0, 0)
  return json({ error: 'quota_exceeded', limit, resetAt: tomorrow.toISOString() }, 429)
}
