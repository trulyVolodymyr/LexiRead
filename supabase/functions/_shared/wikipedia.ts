import { EntityInfo } from './contract.ts'

interface WikiSummary {
  extract?: string
  content_urls?: { desktop?: { page?: string } }
  thumbnail?: { source?: string }
}

async function fetchSummary(lang: string, title: string): Promise<WikiSummary | null> {
  try {
    const res = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      { signal: AbortSignal.timeout(5_000), headers: { accept: 'application/json' } },
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function searchTitle(lang: string, query: string): Promise<string | null> {
  try {
    const url = new URL(`https://${lang}.wikipedia.org/w/api.php`)
    url.searchParams.set('action', 'query')
    url.searchParams.set('list', 'search')
    url.searchParams.set('srsearch', query)
    url.searchParams.set('srlimit', '1')
    url.searchParams.set('format', 'json')
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) return null
    const data = await res.json()
    return data?.query?.search?.[0]?.title ?? null
  } catch {
    return null
  }
}

function isWikipediaUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.wikipedia.org')
  } catch {
    return false
  }
}

/**
 * Short answer + link for a proper noun. Tries the target-language wiki first
 * (user reads articles in their language), then source, then English; one
 * search fallback per language on exact-title miss.
 */
export async function lookupEntity(
  hint: { canonicalName: string; type: EntityInfo['type']; gloss: string },
  srcLang: string,
  tgtLang: string,
): Promise<EntityInfo> {
  const langs = [...new Set([tgtLang, srcLang, 'en'].map((l) => l.split('-')[0]))]

  for (const lang of langs) {
    let summary = await fetchSummary(lang, hint.canonicalName)
    if (!summary?.extract) {
      const found = await searchTitle(lang, hint.canonicalName)
      if (found) summary = await fetchSummary(lang, found)
    }
    const link = summary?.content_urls?.desktop?.page
    if (summary?.extract && link && isWikipediaUrl(link)) {
      return {
        canonicalName: hint.canonicalName,
        type: hint.type,
        summary: summary.extract,
        link,
        thumbnail: summary.thumbnail?.source ?? null,
      }
    }
  }

  // Nothing on Wikipedia — fall back to the model's own gloss, no link.
  return { canonicalName: hint.canonicalName, type: hint.type, summary: hint.gloss, link: null, thumbnail: null }
}
