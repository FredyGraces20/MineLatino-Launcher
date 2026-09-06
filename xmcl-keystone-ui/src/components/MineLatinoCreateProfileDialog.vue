<!--
  MineLatino profile creation wizard.

  Multi-step dialog that replicates the Modrinth app experience:
  1. Config: name, MC version, loader
  2. Content: browse & queue mods / resource packs / shaders from Modrinth
  3. Confirm: summary + create

  On "Crear" the instance is created via InstanceService and each queued
  Modrinth project is installed into it via installModrinthFile tasks.
-->
<template>
  <v-dialog
    v-model="shown"
    width="960"
    :persistent="creating"
    transition="fade-transition"
    content-class="elevation-0"
  >
    <div class="ml-create-dialog surface-dialog flex flex-col overflow-hidden" style="max-height: 85vh">
      <!-- Header -->
      <div class="flex items-center gap-3 px-6 pt-5 pb-3">
        <div
          class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background-color: rgba(var(--v-theme-primary), 0.12)"
        >
          <v-icon size="20" color="primary">add_circle</v-icon>
        </div>
        <div class="min-w-0 flex-grow">
          <div class="text-base font-bold" style="color: var(--ml-text)">
            {{ t('MineLatinoCreateProfile.title') }}
          </div>
          <div class="text-xs" style="color: var(--ml-dim)">
            {{ stepLabels[step - 1] }}
          </div>
        </div>
        <v-btn
          v-if="step > 1"
          icon
          size="small"
          variant="text"
          :disabled="creating"
          @click="step--"
        >
          <v-icon>arrow_back</v-icon>
        </v-btn>
        <v-btn
          icon
          size="small"
          variant="text"
          :disabled="creating"
          @click="close"
        >
          <v-icon>close</v-icon>
        </v-btn>
      </div>

      <v-divider class="mx-6 opacity-20" />

      <!-- Steps -->
      <div class="flex-grow overflow-y-auto px-6 py-4">
        <!-- Step 1: Config -->
        <div v-if="step === 1" class="flex flex-col gap-4">
          <v-text-field
            v-model="profileName"
            :label="t('MineLatinoCreateProfile.name')"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            autofocus
          />

          <v-autocomplete
            v-model="selectedVersion"
            :items="gameVersions"
            :label="t('MineLatinoCreateProfile.mcVersion')"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            :loading="versionsLoading"
          />

          <div>
            <div class="text-xs font-semibold mb-2" style="color: var(--ml-dim)">
              {{ t('MineLatinoCreateProfile.loader') }}
            </div>
            <v-btn-toggle
              v-model="selectedLoader"
              mandatory
              color="primary"
              variant="outlined"
              density="compact"
              divided
              rounded="lg"
              class="ml-loader-toggle"
            >
              <v-btn value="">Vanilla</v-btn>
              <v-btn value="forge">Forge</v-btn>
              <v-btn value="fabric">Fabric</v-btn>
              <v-btn value="neoforge">NeoForge</v-btn>
              <v-btn value="quilt">Quilt</v-btn>
            </v-btn-toggle>
          </div>
        </div>

        <!-- Step 2: Content -->
        <div v-if="step === 2" class="flex flex-col h-full" style="min-height: 400px">
          <v-tabs v-model="contentTab" density="compact" color="primary" class="mb-3">
            <v-tab value="mods">
              <v-icon start size="16">extension</v-icon>
              {{ t('MineLatinoCreateProfile.tabs.mods') }}
              <v-badge v-if="queuedMods.length" :content="queuedMods.length" color="primary" inline class="ml-2" />
            </v-tab>
            <v-tab value="resourcepacks">
              <v-icon start size="16">palette</v-icon>
              {{ t('MineLatinoCreateProfile.tabs.resourcepacks') }}
              <v-badge v-if="queuedResourcepacks.length" :content="queuedResourcepacks.length" color="primary" inline class="ml-2" />
            </v-tab>
            <v-tab value="shaders">
              <v-icon start size="16">blur_on</v-icon>
              {{ t('MineLatinoCreateProfile.tabs.shaders') }}
              <v-badge v-if="queuedShaders.length" :content="queuedShaders.length" color="primary" inline class="ml-2" />
            </v-tab>
          </v-tabs>

          <!-- Search bar -->
          <div class="flex gap-2 mb-3">
            <v-text-field
              v-model="activeSearch.query.value"
              :placeholder="t('MineLatinoCreateProfile.searchPlaceholder')"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              clearable
              prepend-inner-icon="search"
              @keyup.enter="activeSearch.search()"
              @click:clear="activeSearch.query.value = ''; activeSearch.search()"
            />
            <v-select
              v-model="activeSearch.sortBy.value"
              :items="sortOptions"
              item-title="text"
              item-value="value"
              variant="outlined"
              density="compact"
              rounded="lg"
              hide-details
              style="max-width: 180px"
            />
          </div>

          <!-- Results -->
          <div class="flex-grow overflow-y-auto" style="min-height: 0">
            <div v-if="activeSearch.loading && activeSearch.results.length === 0" class="flex justify-center py-8">
              <v-progress-circular indeterminate size="28" width="3" color="primary" />
            </div>
            <div v-else-if="activeSearch.error && activeSearch.results.length === 0" class="text-center py-8">
              <v-icon size="32" color="grey">wifi_off</v-icon>
              <div class="text-sm mt-2" style="color: var(--ml-dim)">{{ t('MineLatinoCreateProfile.searchError') }}</div>
            </div>
            <div v-else-if="activeSearch.results.length === 0" class="text-center py-8">
              <v-icon size="32" color="grey">search_off</v-icon>
              <div class="text-sm mt-2" style="color: var(--ml-dim)">{{ t('MineLatinoCreateProfile.searchEmpty') }}</div>
            </div>
            <template v-else>
              <div
                v-for="hit in activeSearch.results"
                :key="hit.project_id"
                class="ml-search-row flex items-center gap-3 px-3 py-2 rounded-lg mb-1"
              >
                <img
                  v-if="hit.icon_url"
                  :src="hit.icon_url"
                  class="ml-search-icon rounded-lg flex-shrink-0"
                  width="40"
                  height="40"
                  loading="lazy"
                >
                <v-icon v-else size="40" color="grey" class="flex-shrink-0">inventory_2</v-icon>
                <div class="min-w-0 flex-grow">
                  <div class="text-sm font-medium truncate" style="color: var(--ml-text)">{{ hit.title }}</div>
                  <div class="text-xs truncate" style="color: var(--ml-dim)">{{ hit.author }} &middot; {{ formatDownloads(hit.downloads) }} downloads</div>
                  <div class="text-xs truncate mt-0.5" style="color: var(--ml-dim)">{{ hit.description }}</div>
                </div>
                <v-btn
                  v-if="!isQueued(hit.project_id)"
                  size="small"
                  variant="tonal"
                  color="primary"
                  :disabled="creating"
                  @click="queueItem(hit)"
                >
                  <v-icon start size="14">add</v-icon>
                  {{ t('MineLatinoCreateProfile.install') }}
                </v-btn>
                <v-btn
                  v-else
                  size="small"
                  variant="tonal"
                  color="error"
                  :disabled="creating"
                  @click="unqueueItem(hit.project_id)"
                >
                  <v-icon size="14">close</v-icon>
                </v-btn>
              </div>
              <div v-if="activeSearch.hasMore" class="flex justify-center py-3">
                <v-btn
                  size="small"
                  variant="text"
                  :loading="activeSearch.loading"
                  @click="activeSearch.loadMore()"
                >
                  {{ t('MineLatinoCreateProfile.loadMore') }}
                </v-btn>
              </div>
            </template>
          </div>
        </div>

        <!-- Step 3: Confirm -->
        <div v-if="step === 3" class="flex flex-col gap-3">
          <div class="ml-confirm-card rounded-lg pa-4">
            <div class="text-sm font-semibold mb-2" style="color: var(--ml-text)">
              {{ t('MineLatinoCreateProfile.summary') }}
            </div>
            <div class="flex flex-col gap-1 text-sm" style="color: var(--ml-dim)">
              <div><strong>{{ t('MineLatinoCreateProfile.name') }}:</strong> {{ profileName || '(auto)' }}</div>
              <div><strong>{{ t('MineLatinoCreateProfile.mcVersion') }}:</strong> {{ selectedVersion }}</div>
              <div><strong>{{ t('MineLatinoCreateProfile.loader') }}:</strong> {{ selectedLoader || 'Vanilla' }}</div>
            </div>
          </div>
          <div v-if="queuedMods.length || queuedResourcepacks.length || queuedShaders.length" class="ml-confirm-card rounded-lg pa-4">
            <div class="text-sm font-semibold mb-2" style="color: var(--ml-text)">
              {{ t('MineLatinoCreateProfile.contentSummary') }}
            </div>
            <div v-if="queuedMods.length" class="text-sm mb-1" style="color: var(--ml-dim)">
              <v-icon size="14" class="mr-1">extension</v-icon>
              {{ queuedMods.length }} {{ t('MineLatinoCreateProfile.tabs.mods') }}
            </div>
            <div v-if="queuedResourcepacks.length" class="text-sm mb-1" style="color: var(--ml-dim)">
              <v-icon size="14" class="mr-1">palette</v-icon>
              {{ queuedResourcepacks.length }} {{ t('MineLatinoCreateProfile.tabs.resourcepacks') }}
            </div>
            <div v-if="queuedShaders.length" class="text-sm" style="color: var(--ml-dim)">
              <v-icon size="14" class="mr-1">blur_on</v-icon>
              {{ queuedShaders.length }} {{ t('MineLatinoCreateProfile.tabs.shaders') }}
            </div>
          </div>
          <div v-if="creating" class="flex flex-col gap-2 items-center py-4">
            <v-progress-circular indeterminate size="32" width="3" color="primary" />
            <div class="text-sm" style="color: var(--ml-dim)">{{ t('MineLatinoCreateProfile.creating') }}</div>
          </div>
        </div>
      </div>

      <v-divider class="mx-6 opacity-20" />

      <!-- Footer -->
      <div class="flex justify-end gap-2 px-6 py-3">
        <v-btn
          variant="text"
          :disabled="creating"
          @click="close"
        >
          {{ t('MineLatinoCreateProfile.cancel') }}
        </v-btn>
        <v-btn
          v-if="step < 3"
          color="primary"
          variant="flat"
          :disabled="step === 1 && !selectedVersion"
          @click="onNext"
        >
          {{ t('MineLatinoCreateProfile.next') }}
          <v-icon end>arrow_forward</v-icon>
        </v-btn>
        <v-btn
          v-if="step === 3"
          color="primary"
          variant="flat"
          :loading="creating"
          @click="onCreate"
        >
          <v-icon start>check</v-icon>
          {{ t('MineLatinoCreateProfile.create') }}
        </v-btn>
      </div>
    </div>
  </v-dialog>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useService } from '@/composables'
import { InstanceServiceKey, InstanceModsServiceKey, InstanceResourcePacksServiceKey, InstanceShaderPacksServiceKey, MarketType } from '@xmcl/runtime-api'
import { kModrinthTags } from '@/composables/modrinth'
import { clientModrinthV2 } from '@/util/clients'
import { useMineLatinoProfileSearch } from '@/composables/mineLatinoProfileSearch'
import { injection } from '@/util/inject'
import type { SearchResultHit } from '@xmcl/modrinth'

const { t } = useI18n()
const { createInstance } = useService(InstanceServiceKey)
const { installFromMarket: installMod } = useService(InstanceModsServiceKey)
const { installFromMarket: installResourcePack } = useService(InstanceResourcePacksServiceKey)
const { installFromMarket: installShader } = useService(InstanceShaderPacksServiceKey)
const { gameVersions: gameVersionsRaw, isGameVersionValidating: versionsLoading } = injection(kModrinthTags)

const gameVersions = computed(() => gameVersionsRaw.value.map((v: any) => typeof v === 'string' ? v : v.id || v))

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void, (e: 'created', path: string): void }>()

const shown = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const step = ref(1)
const stepLabels = computed(() => [
  t('MineLatinoCreateProfile.stepConfig'),
  t('MineLatinoCreateProfile.stepContent'),
  t('MineLatinoCreateProfile.stepConfirm'),
])

// Step 1 state
const profileName = ref('')
const selectedVersion = ref('')
const selectedLoader = ref('')

// Step 2 state
const contentTab = ref<'mods' | 'resourcepacks' | 'shaders'>('mods')
const sortOptions = computed(() => [
  { text: t('MineLatinoCreateProfile.sortRelevance'), value: 'relevance' },
  { text: t('MineLatinoCreateProfile.sortDownloads'), value: 'downloads' },
  { text: t('MineLatinoCreateProfile.sortNewest'), value: 'newest' },
  { text: t('MineLatinoCreateProfile.sortUpdated'), value: 'updated' },
])

const modSearch = useMineLatinoProfileSearch(
  ref('mod'),
  selectedVersion as any,
  computed(() => selectedLoader.value || ''),
)
const rpSearch = useMineLatinoProfileSearch(
  ref('resourcepack'),
  selectedVersion as any,
  computed(() => selectedLoader.value || ''),
)
const shaderSearch = useMineLatinoProfileSearch(
  ref('shader'),
  selectedVersion as any,
  computed(() => selectedLoader.value || ''),
)

const activeSearch = computed(() => {
  if (contentTab.value === 'resourcepacks') return rpSearch
  if (contentTab.value === 'shaders') return shaderSearch
  return modSearch
})

// Queued items
interface QueuedItem {
  projectId: string
  title: string
  icon: string
  type: 'mod' | 'resourcepack' | 'shader'
}
const queuedMods = ref<QueuedItem[]>([])
const queuedResourcepacks = ref<QueuedItem[]>([])
const queuedShaders = ref<QueuedItem[]>([])

const allQueuedIds = computed(() => new Set([
  ...queuedMods.value,
  ...queuedResourcepacks.value,
  ...queuedShaders.value,
].map(q => q.projectId)))

function isQueued(id: string) {
  return allQueuedIds.value.has(id)
}

function queueItem(hit: SearchResultHit) {
  const item: QueuedItem = {
    projectId: hit.project_id,
    title: hit.title,
    icon: hit.icon_url || '',
    type: contentTab.value === 'resourcepacks' ? 'resourcepack' : contentTab.value === 'shaders' ? 'shader' : 'mod',
  }
  if (item.type === 'resourcepack') queuedResourcepacks.value.push(item)
  else if (item.type === 'shader') queuedShaders.value.push(item)
  else queuedMods.value.push(item)
}

function unqueueItem(id: string) {
  queuedMods.value = queuedMods.value.filter(q => q.projectId !== id)
  queuedResourcepacks.value = queuedResourcepacks.value.filter(q => q.projectId !== id)
  queuedShaders.value = queuedShaders.value.filter(q => q.projectId !== id)
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// Step 3 state
const creating = ref(false)

function onNext() {
  if (step.value === 1) {
    // Trigger initial search when entering content step
    void modSearch.search()
  }
  step.value++
}

function close() {
  if (creating.value) return
  step.value = 1
  profileName.value = ''
  selectedVersion.value = ''
  selectedLoader.value = ''
  contentTab.value = 'mods'
  queuedMods.value = []
  queuedResourcepacks.value = []
  queuedShaders.value = []
  shown.value = false
}

async function onCreate() {
  creating.value = true
  try {
    const runtime: Record<string, string> = { minecraft: selectedVersion.value }
    if (selectedLoader.value === 'forge') runtime.forge = ''
    else if (selectedLoader.value === 'fabric') runtime.fabricLoader = ''
    else if (selectedLoader.value === 'neoforge') runtime.neoForged = ''
    else if (selectedLoader.value === 'quilt') runtime.quiltLoader = ''

    const newPath = await createInstance({
      name: profileName.value || undefined,
      runtime: runtime as any,
    })

    // Install queued Modrinth projects via the appropriate service
    const allQueued = [...queuedMods.value, ...queuedResourcepacks.value, ...queuedShaders.value]
    for (const item of allQueued) {
      try {
        // Fetch the latest compatible version for this project
        const versions = await clientModrinthV2.getProjectVersions(item.projectId, {
          gameVersions: [selectedVersion.value],
          loaders: selectedLoader.value ? [selectedLoader.value] : undefined,
        })
        const latest = versions[0]
        if (!latest) continue

        const opt = {
          market: MarketType.Modrinth as const,
          version: { versionId: latest.id },
          instancePath: newPath,
        }

        if (item.type === 'mod') await installMod(opt)
        else if (item.type === 'resourcepack') await installResourcePack(opt)
        else if (item.type === 'shader') await installShader(opt)
      } catch {
        // Non-fatal: the instance is created, items can be added later
      }
    }

    emit('created', newPath)
    close()
  } catch (err) {
    console.error('Failed to create profile:', err)
  } finally {
    creating.value = false
  }
}

// Watch content tab to trigger search on first switch
const searchedTabs = ref(new Set<string>())
watch(contentTab, (tab) => {
  const search = tab === 'resourcepacks' ? rpSearch : tab === 'shaders' ? shaderSearch : modSearch
  if (!searchedTabs.value.has(tab) && search.results.length === 0) {
    searchedTabs.value.add(tab)
    void search.search()
  }
})

// Reset searched tabs when dialog closes
watch(shown, (v) => {
  if (!v) searchedTabs.value.clear()
})
</script>

<style scoped>
.ml-create-dialog {
  border-radius: var(--ml-radius, 12px);
  background: var(--ml-panel, #1e1e1e);
  border: 1px solid var(--ml-border, rgba(255, 255, 255, 0.08));
}

.ml-loader-toggle {
  width: 100%;
}

.ml-loader-toggle .v-btn {
  flex: 1;
}

.ml-search-row {
  transition: background-color 0.15s ease;
}

.ml-search-row:hover {
  background-color: var(--ml-raise, rgba(255, 255, 255, 0.04));
}

.ml-search-icon {
  object-fit: cover;
}

.ml-confirm-card {
  background: var(--ml-raise, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--ml-border, rgba(255, 255, 255, 0.08));
}
</style>
