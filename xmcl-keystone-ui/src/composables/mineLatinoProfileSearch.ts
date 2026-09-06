import type { SearchResult, SearchResultHit } from '@xmcl/modrinth'
import { computed, ref, Ref } from 'vue'
import { getFacatsText } from './modrinth'
import { clientModrinthV2 } from '@/util/clients'

const PAGE_SIZE = 20

/**
 * Lightweight Modrinth search scoped to a target Minecraft version + loader.
 * Used by the profile creation dialog to browse mods, resource packs and
 * shaders that are compatible with the profile being built.
 *
 * Uses the same clientModrinthV2.searchProjects() as the main store search
 * which is proven to work through the Electron protocol handler chain.
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

      const result = await clientModrinthV2.searchProjects({
        query: query.value || '',
        limit: PAGE_SIZE,
        offset: offset.value,
        index: sortBy.value || (query.value ? 'relevance' : 'downloads'),
        facets: facetsText,
      })

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
