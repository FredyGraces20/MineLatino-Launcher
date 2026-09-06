import type { SearchResult, SearchResultHit } from '@xmcl/modrinth'
import { computed, ref, Ref } from 'vue'
import { getFacatsText } from './modrinth'

const PAGE_SIZE = 20
const SEARCH_TIMEOUT_MS = 15_000

/**
 * Lightweight Modrinth search scoped to a target Minecraft version + loader.
 * Used by the profile creation dialog to browse mods, resource packs and
 * shaders that are compatible with the profile being built.
 *
 * Uses XMLHttpRequest instead of fetch because the Electron session intercepts
 * all HTTP(S) requests through a protocol handler chain (ElectronSession.ts),
 * and fetch's ReadableStream response body may not properly terminate through
 * that chain. XHR has a simpler request/response model with built-in timeout.
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

  function getType(): string {
    const v = projectType.value
    if (v === 'resourcepacks') return 'resourcepack'
    if (v === 'shaders') return 'shader'
    return 'mod'
  }

  function doRequest(url: string): Promise<SearchResult> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', url)
      xhr.timeout = SEARCH_TIMEOUT_MS
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as SearchResult)
          } catch (e) {
            reject(new Error('Invalid JSON response'))
          }
        } else {
          reject(new Error(`Modrinth search failed: ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('Network error'))
      xhr.ontimeout = () => reject(new Error('Search timed out'))
      xhr.send()
    })
  }

  async function search(reset = true) {
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

      const params = new URLSearchParams()
      params.set('query', query.value || '')
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(offset.value))
      params.set('index', sortBy.value || (query.value ? 'relevance' : 'downloads'))
      if (facetsText) {
        params.set('facets', facetsText)
      }

      const url = `https://api.modrinth.com/v2/search?${params.toString()}`
      const result = await doRequest(url)

      if (reset) {
        results.value = result.hits
      } else {
        results.value = [...results.value, ...result.hits]
      }
      total.value = result.total_hits
      offset.value += result.hits.length
      hasMore.value = offset.value < result.total_hits
    } catch (e) {
      console.warn('[MineLatinoProfileSearch] search error', e)
      if (results.value.length === 0) {
        error.value = true
      }
    } finally {
      loading.value = false
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
