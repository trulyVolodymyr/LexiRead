import Anthropic from 'npm:@anthropic-ai/sdk@0.74.0'
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

const MODEL = Deno.env.get('AI_MODEL') ?? 'claude-haiku-4-5'

const client = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
  timeout: 15_000,
})

async function structured<T>(prompt: string, schema: unknown): Promise<T> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  })
  if (response.stop_reason === 'refusal') {
    throw new Error('provider_refused')
  }
  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Error('provider_empty_response')
  return JSON.parse(text.text) as T
}

export const claude: AIProvider = {
  name: 'claude',
  wordLookup: (req: ProviderRequest) => structured<WordModelResult>(wordPrompt(req), WORD_SCHEMA),
  sentenceTranslate: (req: ProviderRequest) =>
    structured<SentenceModelResult>(sentencePrompt(req), SENTENCE_SCHEMA),
}
