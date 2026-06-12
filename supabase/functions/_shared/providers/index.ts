import { AIProvider } from '../contract.ts'
import { claude } from './claude.ts'
import { gemini } from './gemini.ts'
import { openai } from './openai.ts'

const providers: Record<string, AIProvider> = { claude, gemini, openai }

export function getProvider(): AIProvider {
  const name = Deno.env.get('AI_PROVIDER') ?? 'claude'
  const provider = providers[name]
  if (!provider) throw new Error(`unknown AI_PROVIDER: ${name}`)
  return provider
}
