<!--
  MineLatino "Jugar" screen: the server's own showcase — its logo, name and
  live player count in a frosted card over a Minecraft backdrop, the player's
  own skin rendered live in 3D on a lit stage to the right, and the "Empezar"
  button at the bottom left that launches the game straight into the server
  with the profile selected in the right-hand panel (the shared launch funnel
  in `instanceLaunch.ts` adds the auto-join flags).

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

    <!-- Two-column stage over the backdrop: a frosted server-identity card and
         the launch actions on the left, the player's live 3D skin on the right. -->
    <div class="ml-play-layout relative flex min-h-0 flex-1 items-stretch gap-6 p-6">
      <div class="ml-play-info flex min-w-0 flex-1 flex-col">
        <!-- Server identity: logo, name and how full it is right now. -->
        <div class="ml-play-idcard">
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

        <!-- "Empezar": bottom left, launches with the selected profile. -->
        <div class="ml-play-actions flex flex-wrap items-end gap-3">
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
      </div>

      <!-- The player's own skin, rendered live in 3D on a lit stage. skinview3d
           auto-detects the slim/classic model and floats the in-game nametag. -->
      <div class="ml-play-stage">
        <div class="ml-play-stage-glow" aria-hidden="true" />
        <div class="ml-play-stage-floor" aria-hidden="true" />
        <div class="ml-play-skin">
          <SkinView
            :skin="skinUrl"
            :name="playerName"
            :width="280"
            :height="380"
            animation="idle"
          />
        </div>
      </div>
    </div>
  </section>
</template>
<script lang="ts" setup>
import defaultBackground from '@/assets/banners/1.20.webp'
import bundledLogo from '@/assets/minelatino-logo.png'
import steveSkin from '@/assets/steve_skin.png'
import SkinView from '@/components/SkinView.vue'
import { useDialog } from '@/composables/dialog'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kInstances } from '@/composables/instances'
import { kLaunchButton } from '@/composables/launchButton'
import { kMineLatino } from '@/composables/minelatino'
import { useMinecraftProtocol } from '@/composables/protocol'
import { useServerStatus } from '@/composables/serverStatus'
import { kUserContext } from '@/composables/user'
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
const { userProfile, gameProfile } = injection(kUserContext)

const hasProfile = computed(() => !!selectedInstance.value)
const selected = computed(() => instances.value.find(i => i.path === selectedInstance.value))

/**
 * The signed-in player's own skin, rendered live in 3D on the right; falls
 * back to the bundled Steve when there is no profile texture (offline or not
 * signed in). skinview3d infers the slim vs classic model from the image.
 */
const skinUrl = computed(() => gameProfile.value?.textures?.SKIN?.url || steveSkin)
const playerName = computed(() => gameProfile.value?.name || userProfile.value?.username || 'Steve')

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

.ml-play-layout {
  min-height: 0;
}

/* Frosted identity card so the logo/name stay legible over the backdrop. */
.ml-play-idcard {
  display: flex;
  align-items: center;
  gap: 16px;
  align-self: flex-start;
  max-width: 560px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--ml-accent) 22%, transparent);
  background-color: color-mix(in srgb, rgb(var(--v-theme-surface)) 58%, transparent);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  box-shadow: 0 20px 44px -26px rgba(0, 0, 0, 0.85);
}

.ml-play-logo {
  width: 72px;
  height: 72px;
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

/* ── 3D skin stage ── */
.ml-play-stage {
  position: relative;
  flex: 0 0 auto;
  width: 340px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ml-play-stage-glow {
  position: absolute;
  inset: 8% 12%;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--ml-accent) 42%, transparent),
    transparent 72%
  );
  filter: blur(22px);
  animation: ml-stage-pulse 5.5s ease-in-out infinite;
}

.ml-play-stage-floor {
  position: absolute;
  bottom: 6%;
  left: 50%;
  width: 210px;
  height: 46px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    color-mix(in srgb, var(--ml-accent) 55%, transparent),
    transparent 70%
  );
  filter: blur(7px);
  opacity: 0.5;
}

.ml-play-skin {
  position: relative;
  z-index: 1;
  animation: ml-skin-float 6s ease-in-out infinite;
}

.ml-play-skin :deep(canvas) {
  display: block;
  max-width: 100%;
  height: auto;
}

@keyframes ml-skin-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-9px); }
}

@keyframes ml-stage-pulse {
  0%, 100% { opacity: 0.6; transform: scale(0.98); }
  50% { opacity: 0.9; transform: scale(1.04); }
}

/* Hero launch button: taller and accent-lit, riding the global 3D press. */
.ml-play-start {
  height: 56px;
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 18px 34px -16px color-mix(in srgb, var(--ml-accent) 85%, transparent) !important;
}

.ml-play-start:not(.v-btn--disabled):hover {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 24px 46px -16px color-mix(in srgb, var(--ml-accent) 95%, transparent) !important;
}

/* Narrow windows: shrink the stage, then drop it so the CTA stays reachable. */
@media (max-width: 1100px) {
  .ml-play-stage {
    width: 250px;
  }
}

@media (max-width: 900px) {
  .ml-play-layout {
    gap: 12px;
  }

  .ml-play-stage {
    display: none;
  }
}
</style>
