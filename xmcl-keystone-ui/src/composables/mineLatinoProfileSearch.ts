import type { SearchResult, SearchResultHit } from '@xmcl/modrinth'
import { computed, ref, Ref } from 'vue'
import { getFacatsText } from './modrinth'

const PAGE_SIZE = 20
const SEARCH_TIMEOUT_MS = 15_000

/**
 * Lightweight Modrinth search scoped to a target Minecraft version + loader.
 * Used by the profile creation dialog to browse mods, resource packs and
 * shaders that are compatible with the profile being built.
 */
export function useMineLatinoProfileSearch(
  projectType: Ref<'mod' | 'resourcepacks' | 'shaders'>,
  gameVersion: Ref<string>,
  loader: Ref<string>,
) {
  const query = ref('')
  const sortBy = ref<string | undefined>('relevance')
  const results = ref<SearchResultHit[]>([])
  const loading = ref(false)
  const error = ref(false)
  const offset = ref(0)
  const hasMore = ref(true)
  const total = ref(0)

  let requestId = 0

  function getType(): string {
    const v = projectType.value
    if (v === 'resourcepacks') return 'resourcepack'
    if (v === 'shaders') return 'shader'
    return 'mod'
  }

  async function search(reset = true) {
    const myId = ++requestId

    if (reset) {
      offset.value = 0
      results.value = []
      hasMore.value = true
    }
    loading.value = true
    error.value = false

    try {
      const facetsText = getFacatsText(
        gameVersion.value,
        '',
        [],
        loader.value ? [loader.value] : [],
        getType(),
        'client',
      )

      const url = new URL('https://api.modrinth.com/v2/search')
      url.searchParams.set('query', query.value || '')
      url.searchParams.set('limit', String(PAGE_SIZE))
      url.searchParams.set('offset', String(offset.value))
      url.searchParams.set('index', sortBy.value || (query.value ? 'relevance' : 'downloads'))
      if (facetsText) {
        url.searchParams.set('facets', facetsText)
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

      let result: SearchResult
      try {
        const response = await fetch(url.toString(), { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Modrinth search failed: ${response.status}`)
        }
        result = await response.json() as SearchResult
      } finally {
        clearTimeout(timeoutId)
      }

      // If another search was triggered while we were waiting, discard this result
      if (requestId !== myId) return

      if (reset) {
        results.value = result.hits
      } else {
        results.value = [...results.value, ...result.hits]
      }
      total.value = result.total_hits
      offset.value += result.hits.length
      hasMore.value = offset.value < result.total_hits
    } catch (e) {
      if (requestId !== myId) return
      console.warn('[MineLatinoProfileSearch] search error', e)
      if (results.value.length === 0) {
        error.value = true
      }
    } finally {
      if (requestId === myId) {
        loading.value = false
      }
    }
  }

  function loadMore() {
    if (hasMore.value && !loading.value) {
      void search(false)
    }
  }

  const resultCount = computed(() => results.value.length)

  return {
    query,
    sortBy,
    results,
    loading,
    error,
    hasMore,
    total,
    resultCount,
    search,
    loadMore,
  }
}
