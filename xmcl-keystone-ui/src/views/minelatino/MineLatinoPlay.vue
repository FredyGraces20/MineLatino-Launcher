<!--
  MineLatino "Jugar" screen: the server's own showcase — its logo, name and
  live player count over a Minecraft backdrop, with the "Empezar" button at
  the bottom right that launches the game straight into the server with the
  profile selected in the right-hand panel (the shared launch funnel in
  `instanceLaunch.ts` adds the auto-join flags).

  The backdrop defaults to a bundled Minecraft panorama and honours
  `branding.backgroundUrl` when the backend supplies one, so the art can be
  swapped without shipping a new installer.
-->
<template>
  <section
    v-if="isConfigured"
    data-testid="minelatino-play"
    class="ml-play relative flex h-full min-h-[420px] flex-col overflow-hidden"
    :style="bgStyle"
  >
    <div class="ml-play-scrim absolute inset-0" aria-hidden="true" />

    <v-alert
      v-if="maintenance && maintenance.enabled"
      class="relative m-4 mb-0"
      type="warning"
      variant="tonal"
      density="compact"
      :title="t('MineLatinoHome.maintenanceTitle')"
      :text="maintenance.message"
    />

    <!-- Server identity: logo, name and how full it is right now. -->
    <div class="relative flex items-start gap-4 p-6">
      <img
        class="ml-play-logo"
        :src="serverLogo"
        :alt="serverName"
        draggable="false"
        v-fallback-img="BuiltinImages.minecraft"
      >
      <div class="min-w-0">
        <h1 class="ml-play-title">
          {{ serverName }}
        </h1>
        <div v-if="branding?.tagline" class="ml-play-tagline">
          {{ branding.tagline }}
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <v-chip
            size="small"
            variant="tonal"
            :color="playersColor"
            :title="t('MineLatinoHome.refresh')"
            data-testid="minelatino-players"
            @click="refresh()"
          >
            <v-icon start size="14" :class="{ 'animate-spin': pinging }" aria-hidden="true">
              {{ pinging ? 'progress_activity' : 'group' }}
            </v-icon>
            {{ playersLabel }}
          </v-chip>
        </div>
      </div>
    </div>

    <div class="flex-grow" />

    <!-- "Empezar": bottom right, launches with the selected profile. -->
    <div class="relative flex items-end justify-end gap-3 p-6">
      <v-btn
        v-if="!hasProfile"
        variant="tonal"
        :color="accentColor || 'primary'"
        data-testid="minelatino-add-version"
        @click="showAddInstance()"
      >
        <v-icon start aria-hidden="true"> add </v-icon>
        {{ t('MineLatinoPlay.addVersion') }}
      </v-btn>
      <v-btn
        size="x-large"
        rounded="pill"
        :color="accentColor || 'primary'"
        :disabled="!hasProfile"
        :loading="loading"
        class="ml-play-start pl-10 pr-10"
        data-testid="minelatino-start"
        @click="onStart"
      >
        <v-icon start aria-hidden="true"> play_arrow </v-icon>
        {{ t('MineLatinoPlay.empezar') }}
      </v-btn>
    </div>
  </section>
</template>
<script lang="ts" setup>
import defaultBackground from '@/assets/banners/1.20.webp'
import bundledLogo from '@/assets/minelatino-logo.png'
import { useDialog } from '@/composables/dialog'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kInstances } from '@/composables/instances'
import { kLaunchButton } from '@/composables/launchButton'
import { kMineLatino } from '@/composables/minelatino'
import { useMinecraftProtocol } from '@/composables/protocol'
import { useServerStatus } from '@/composables/serverStatus'
import { BuiltinImages } from '@/constant'
import { vFallbackImg } from '@/directives/fallbackImage'
import { injection } from '@/util/inject'

const { t } = useI18n()
const {
  branding,
  server,
  maintenance,
  accentColor,
  isConfigured,
} = injection(kMineLatino)
const { instances, selectedInstance } = injection(kInstances)
const { onClick, loading } = injection(kLaunchButton)
const { show: showAddInstance } = useDialog(AddInstanceDialogKey)

const hasProfile = computed(() => !!selectedInstance.value)
const selected = computed(() => instances.value.find(i => i.path === selectedInstance.value))

const serverName = computed(() =>
  server.value?.name || branding.value?.name || t('MineLatinoPlay.startTitle'),
)

/**
 * `server.icon` may arrive as a data URI, an http(s) URL or a bare base64 PNG
 * (the `servers.dat` flavour); anything else falls back to the brand logo.
 */
const serverLogo = computed(() => {
  const icon = server.value?.icon?.trim()
  if (icon) {
    if (/^data:image\//i.test(icon)) return icon
    if (/^https?:\/\//i.test(icon)) return icon
    if (!/^[\w+\-.]+:\/\//i.test(icon)) return `data:image/png;base64,${icon}`
  }
  return branding.value?.logoUrl || bundledLogo
})

/**
 * Backend art when it is safe to interpolate into `url("...")`, the bundled
 * Minecraft panorama otherwise ("pon una de minecraft por defecto").
 */
const bgStyle = computed(() => {
  const url = branding.value?.backgroundUrl
  const safe = url
    && /^(?:https?:\/\/|data:image\/)/i.test(url)
    && !/["'()\s\\]/.test(url)
  return {
    'background-image': `url("${safe ? url : defaultBackground}")`,
    'background-size': 'cover',
    'background-position': 'center',
  }
})

// Live player count for the configured server, pinged through the shared
// cache so revisiting the panel within the TTL costs nothing.
const protocol = useMinecraftProtocol(computed(() => selected.value?.runtime.minecraft))
const serverRef = computed(() => ({ host: server.value?.host ?? '', port: server.value?.port }))
const { status, pinging, refresh, refreshIfStale } = useServerStatus(serverRef, protocol)
onMounted(() => { refreshIfStale() })

const playersLabel = computed(() => {
  const players = status.value.players
  if (players.online < 0) {
    return pinging.value ? t('serverStatus.ping') : t('MineLatinoPlay.playersOffline')
  }
  return t('MineLatinoPlay.players', { online: players.online, max: players.max })
})
const playersColor = computed(() => (status.value.players.online < 0 ? 'grey' : 'success'))

function onStart() {
  void onClick()
}
</script>

<style scoped>
/* Readability scrim: the art stays vivid at the top and dissolves into the
   theme surface towards the bottom where the launch button lives. */
.ml-play-scrim {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, rgb(var(--v-theme-surface)) 28%, transparent) 0%,
    color-mix(in srgb, rgb(var(--v-theme-surface)) 62%, transparent) 55%,
    color-mix(in srgb, rgb(var(--v-theme-surface)) 88%, transparent) 100%
  );
  pointer-events: none;
}

.ml-play-logo {
  width: 84px;
  height: 84px;
  border-radius: 16px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ml-accent) 45%, transparent),
    0 12px 28px -14px rgba(0, 0, 0, 0.8);
}

.ml-play-title {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: 0.01em;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
}

.ml-play-tagline {
  margin-top: 2px;
  font-size: 0.95rem;
  color: var(--color-secondary-text);
}

.ml-play-start {
  height: 56px;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  box-shadow: 0 14px 30px -14px color-mix(in srgb, var(--ml-accent) 70%, transparent);
}
</style>
