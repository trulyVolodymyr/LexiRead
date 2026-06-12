import {
  AIProvider,
  ProviderRequest,
  SENTENCE_SCHEMA,
  SentenceModelResult,
  WORD_SCHEMA,
  WordModelResult,
  sentencePrompt,
  wordPrompt,
} from '../contract.ts'

const MODEL = Deno.env.get('AI_MODEL') ?? 'gemini-2.5-flash'

// Gemini's responseSchema is an OpenAPI-style subset: no additionalProperties,
// nullability via `nullable` instead of anyOf-with-null.
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema)
  if (schema && typeof schema === 'object') {
    const obj = schema as Record<string, unknown>
    if (Array.isArray(obj.anyOf)) {
      const variants = obj.anyOf as Record<string, unknown>[]
      const nonNull = variants.filter((v) => v.type !== 'null')
      const hadNull = nonNull.length !== variants.length
      const base = nonNull.length === 1 ? toGeminiSchema(nonNull[0]) as Record<string, unknown> : { type: 'string' }
      return hadNull ? { ...base, nullable: true } : base
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'additionalProperties') continue
      out[k] = toGeminiSchema(v)
    }
    return out
  }
  return schema
}

async function structured<T>(prompt: string, schema: unknown): Promise<T> {
  const key = Deno.env.get('GEMINI_API_KEY')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(schema),
          maxOutputTokens: 1024,
        },
      }),
    },
  )
  if (!res.ok) throw new Error(`gemini_error_${res.status}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('provider_empty_response')
  return JSON.parse(text) as T
}

export const gemini: AIProvider = {
  name: 'gemini',
  wordLookup: (req: ProviderRequest) => structured<WordModelResult>(wordPrompt(req), WORD_SCHEMA),
  sentenceTranslate: (req: ProviderRequest) =>
    structured<SentenceModelResult>(sentencePrompt(req), SENTENCE_SCHEMA),
}
