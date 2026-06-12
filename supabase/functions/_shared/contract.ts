// Shared request/response contract for the translate function.
// Every provider adapter must emit these exact shapes.

export type TranslateMode = 'word' | 'sentence'

export interface TranslateRequest {
  mode: TranslateMode
  word?: string
  sentence: string
  srcLang: string
  tgtLang: string
}

export interface WordMeaning {
  translation: string
  pos: string | null
  register: string | null
  note: string | null
}

export interface EntityInfo {
  canonicalName: string
  type: 'person' | 'place' | 'work' | 'organization' | 'other'
  summary: string
  link: string | null
  thumbnail: string | null
}

// What the model returns for a word lookup (before Wikipedia enrichment).
export interface WordModelResult {
  lemma: string
  transliteration: string | null
  isProperNoun: boolean
  meanings: WordMeaning[]
  bestInContext: { translation: string; explanation: string }
  // only when isProperNoun — the model's own knowledge, used to query Wikipedia
  entityHint: { canonicalName: string; type: EntityInfo['type']; gloss: string } | null
}

export interface SentenceModelResult {
  translation: string
  notes: string | null
}

export interface WordResponse extends Omit<WordModelResult, 'entityHint'> {
  mode: 'word'
  word: string
  entity: EntityInfo | null
  cached: boolean
  provider: string
}

export interface SentenceResponse extends SentenceModelResult {
  mode: 'sentence'
  cached: boolean
  provider: string
}

export interface ProviderRequest {
  word?: string
  sentence: string
  srcLang: string
  tgtLang: string
}

export interface AIProvider {
  name: string
  wordLookup(req: ProviderRequest): Promise<WordModelResult>
  sentenceTranslate(req: ProviderRequest): Promise<SentenceModelResult>
}

// JSON Schemas used by every adapter to force structured output.
// Claude: output_config.format / Gemini: responseSchema / OpenAI: response_format.

export const WORD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lemma', 'transliteration', 'isProperNoun', 'meanings', 'bestInContext', 'entityHint'],
  properties: {
    lemma: { type: 'string', description: 'Dictionary/base form of the word in the source language' },
    transliteration: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Latin transliteration when the source script is non-Latin, else null',
    },
    isProperNoun: { type: 'boolean' },
    meanings: {
      type: 'array',
      description: 'ALL distinct meanings of the word translated to the target language, most common first. Empty for proper nouns.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['translation', 'pos', 'register', 'note'],
        properties: {
          translation: { type: 'string' },
          pos: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'part of speech' },
          register: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'e.g. informal, archaic, vulgar' },
          note: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'short disambiguation note' },
        },
      },
    },
    bestInContext: {
      type: 'object',
      additionalProperties: false,
      required: ['translation', 'explanation'],
      properties: {
        translation: { type: 'string', description: 'The best translation of the word IN THIS SENTENCE' },
        explanation: { type: 'string', description: 'One short sentence: why this meaning fits here (grammar form, idiom, etc.)' },
      },
    },
    entityHint: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['canonicalName', 'type', 'gloss'],
          properties: {
            canonicalName: { type: 'string', description: 'Canonical English name of the entity, suitable as a Wikipedia title' },
            type: { type: 'string', enum: ['person', 'place', 'work', 'organization', 'other'] },
            gloss: { type: 'string', description: 'One-sentence explanation of what/who this is, in the target language' },
          },
        },
      ],
      description: 'Only when isProperNoun is true, else null',
    },
  },
} as const

export const SENTENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['translation', 'notes'],
  properties: {
    translation: { type: 'string', description: 'Natural translation of the sentence into the target language' },
    notes: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'Optional: one short note about grammar/idiom worth knowing, in the target language',
    },
  },
} as const

export function wordPrompt(req: ProviderRequest): string {
  return `You are a dictionary and translation assistant inside an e-book reader.
The reader clicked the word "${req.word}" (source language: ${req.srcLang}) in this passage:

"""${req.sentence}"""

Target language for all translations and explanations: ${req.tgtLang}.

Return:
- lemma: the dictionary form of the clicked word.
- transliteration: Latin transliteration if the source script is non-Latin, else null.
- isProperNoun: whether this is a name of a person, place, work, organization, etc.
- meanings: ALL distinct meanings of the word (as used generally, not just here), translated to ${req.tgtLang}, most common first, with part of speech. Empty array if it is a proper noun.
- bestInContext: the single best translation of the word in this exact passage, with a one-sentence explanation in ${req.tgtLang}.
- entityHint: only for proper nouns — canonical English name (usable as a Wikipedia article title), entity type, and a one-sentence gloss in ${req.tgtLang}. Null otherwise.`
}

export function sentencePrompt(req: ProviderRequest): string {
  return `Translate this ${req.srcLang} passage from a book into natural ${req.tgtLang}.
Add a short note (in ${req.tgtLang}) only if there is a grammar point or idiom genuinely worth flagging, else null.

"""${req.sentence}"""`
}
