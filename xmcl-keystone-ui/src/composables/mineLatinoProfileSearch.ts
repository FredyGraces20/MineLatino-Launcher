import { clientModrinthV2 } from '@/util/clients'
import type { SearchResultHit } from '@xmcl/modrinth'
import { computed, ref, Ref } from 'vue'

const PAGE_SIZE = 20

/**
 * Lightweight Modrinth search scoped to a target Minecraft version + loader.
 * Used by the profile creation dialog to browse mods, resource packs and
 * shaders that are compatible with the profile being built.
 */
export function useMineLatinoProfileSearch(
  projectType: Ref<'mod' | 'resourcepack' | 'shader'>,
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

  let currentController: AbortController | undefined

  function buildFacets() {
    const facets: string[][] = []
    if (projectType.value) {
      facets.push([`project_type:${projectType.value}`])
    }
    if (gameVersion.value) {
      facets.push([`versions:${gameVersion.value}`])
    }
    if (loader.value) {
      facets.push([`categories:${loader.value}`])
    }
    facets.push(['client_side:optional', 'client_side:required'], ['server_side:optional', 'server_side:unsupported'])
    if (facets.length > 0) {
      return '[' + facets.map(v => '[' + v.map(v => JSON.stringify(v)).join(',') + ']').join(',') + ']'
    }
    return undefined
  }

  async function search(reset = true) {
    if (reset) {
      offset.value = 0
      results.value = []
      hasMore.value = true
    }
    if (currentController) {
      currentController.abort()
    }
    currentController = new AbortController()
    loading.value = true
    error.value = false
    try {
      const facets = buildFacets()
      const result = await clientModrinthV2.searchProjects({
        query: query.value,
        limit: PAGE_SIZE,
        offset: offset.value,
        index: sortBy.value,
        facets,
      }, currentController.signal)
      if (reset) {
        results.value = result.hits
      } else {
        results.value = [...results.value, ...result.hits]
      }
      total.value = result.total_hits
      offset.value += result.hits.length
      hasMore.value = offset.value < result.total_hits
    } catch {
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
