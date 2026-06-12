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

const MODEL = Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini'

async function structured<T>(prompt: string, schema: unknown, schemaName: string): Promise<T> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  })
  if (!res.ok) throw new Error(`openai_error_${res.status}`)
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error('provider_empty_response')
  return JSON.parse(text) as T
}

export const openai: AIProvider = {
  name: 'openai',
  wordLookup: (req: ProviderRequest) =>
    structured<WordModelResult>(wordPrompt(req), WORD_SCHEMA, 'word_lookup'),
  sentenceTranslate: (req: ProviderRequest) =>
    structured<SentenceModelResult>(sentencePrompt(req), SENTENCE_SCHEMA, 'sentence_translation'),
}
