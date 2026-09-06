<!--
  MineLatino start screen: the branded hero plus the big tiles that are the
  whole navigation of the launcher (Jugar / Tienda / Anuncios / Actualizaciones,
  and a full-width Actualizar self-update tile). There is no persistent rail —
  each tile opens its own full screen and the shell header carries the way back.

  Injects `kMineLatino` from `MineLatinoShell.vue` (never re-subscribes), and
  renders nothing when the backend sent no MineLatino config, so an unbranded
  build that somehow lands here stays blank instead of showing empty chrome.
-->
<template>
  <section
    v-if="isConfigured"
    data-testid="minelatino-start"
    class="ml-start flex flex-col gap-4 p-4"
  >
    <!-- Hero: backend art (when supplied) behind the logo, name and tagline. -->
    <v-card
      class="ml-hero"
      :color="cardColor"
      :style="heroStyle"
      elevation="0"
    >
      <div class="ml-hero-body">
        <v-avatar size="72" rounded="lg" class="ml-hero-logo">
          <img
            :src="logoSrc"
            :alt="brandName"
            draggable="false"
            v-fallback-img="BuiltinImages.minecraft"
          >
        </v-avatar>
        <h1 class="ml-hero-title">
          {{ brandName }}
        </h1>
        <div v-if="branding?.tagline" class="ml-hero-tagline">
          {{ branding.tagline }}
        </div>
      </div>
    </v-card>

    <!-- The four content destinations; the self-update tile is appended below. -->
    <div class="ml-tiles">
      <div
        v-for="tile in tiles"
        :key="tile.key"
        class="ml-tile"
        role="button"
        tabindex="0"
        :data-testid="`minelatino-tile-${tile.key}`"
        :aria-label="t(`MineLatinoNav.${tile.key}`)"
        @click="go(tile.to)"
        @keydown.enter="go(tile.to)"
        @keydown.space.prevent="go(tile.to)"
      >
        <v-icon class="ml-tile-icon" size="40" aria-hidden="true">
          {{ tile.icon }}
        </v-icon>
        <div class="ml-tile-title">
          {{ t(`MineLatinoNav.${tile.key}`) }}
        </div>
        <div class="ml-tile-hint">
          {{ t(`MineLatinoNav.${tile.key}Hint`) }}
        </div>
      </div>

      <!-- Fifth destination: the launcher's own self-update. Full width so it
           reads as an action distinct from the content sections above, and it
           grows a badge dot the moment the backend advertises a new version. -->
      <div
        class="ml-tile ml-tile-update"
        role="button"
        tabindex="0"
        data-testid="minelatino-tile-actualizar"
        :aria-label="t('MineLatinoNav.actualizar')"
        @click="go('/minelatino/actualizar')"
        @keydown.enter="go('/minelatino/actualizar')"
        @keydown.space.prevent="go('/minelatino/actualizar')"
      >
        <v-icon class="ml-tile-icon" size="40" aria-hidden="true">
          system_update
        </v-icon>
        <div class="ml-tile-title">
          {{ t('MineLatinoNav.actualizar') }}
          <span v-if="updateAvailable" class="ml-tile-badge" aria-hidden="true" />
        </div>
        <div class="ml-tile-hint">
          {{ updateHint }}
        </div>
      </div>
    </div>
  </section>
</template>
<script lang="ts" setup>
import bundledLogo from '@/assets/minelatino-logo.png'
import { kMineLatino } from '@/composables/minelatino'
import { useUpdateSettings } from '@/composables/setting'
import { kTheme } from '@/composables/theme'
import { BuiltinImages } from '@/constant'
import { vFallbackImg } from '@/directives/fallbackImage'
import { injection } from '@/util/inject'

const { t } = useI18n()
const router = useRouter()
const { cardColor, blurCard } = injection(kTheme)
const { branding, accentColor, isConfigured } = injection(kMineLatino)

const brandName = computed(() => branding.value?.name || t('MineLatinoPlay.startTitle'))
const logoSrc = computed(() => branding.value?.logoUrl || bundledLogo)

const tiles = [
  { key: 'jugar', icon: 'play_arrow', to: '/minelatino/jugar' },
  { key: 'tienda', icon: 'storefront', to: '/minelatino/tienda' },
  { key: 'anuncios', icon: 'campaign', to: '/minelatino/anuncios' },
  { key: 'actualizaciones', icon: 'new_releases', to: '/minelatino/actualizaciones' },
]

function go(to: string) {
  router.push(to)
}

// The self-update tile is rendered on its own so it can show a live status
// instead of a static hint. `useUpdateSettings()` reads the same shared
// `kSettingsState` the updater writes to, so the badge reflects the startup
// check without this screen re-fetching anything.
const { updateStatus, updateInfo } = useUpdateSettings()
const updateAvailable = computed(() => updateStatus.value !== 'none' && !!updateInfo.value?.newUpdate)
const updateHint = computed(() => {
  if (!updateAvailable.value) return t('MineLatinoNav.actualizarHint')
  const name = updateInfo.value?.name
  return name ? `${t('MineLatinoUpdate.available')} · ${name}` : t('MineLatinoUpdate.available')
})

/**
 * Hero art, when the backend supplies one.
 *
 * Only `http(s)` and `data:image/` URLs survive, and anything containing a
 * quote, parenthesis, backslash or whitespace is dropped, because the value is
 * interpolated into a `url("...")` wrapper and must not be able to break out.
 */
const heroBackground = computed(() => {
  const url = branding.value?.backgroundUrl
  if (!url) return ''
  if (!/^(?:https?:\/\/|data:image\/)/i.test(url)) return ''
  return /["'()\s\\]/.test(url) ? '' : url
})

/**
 * The scrim is built from the theme's own surface colour instead of a fixed
 * black overlay, so the title and tagline keep their contrast in both light and
 * dark themes whatever art the backend sends.
 */
const heroStyle = computed(() => {
  const style: Record<string, string> = { 'backdrop-filter': `blur(${blurCard}px)` }
  if (heroBackground.value) {
    const scrim = 'linear-gradient('
      + 'color-mix(in srgb, rgb(var(--v-theme-surface)) 68%, transparent),'
      + 'color-mix(in srgb, rgb(var(--v-theme-surface)) 86%, transparent))'
    style['background-image'] = `${scrim}, url("${heroBackground.value}")`
    style['background-size'] = 'cover'
    style['background-position'] = 'center'
  }
  return style
})
</script>

<style scoped>
.ml-start {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.ml-hero {
  border-radius: 14px;
  overflow: hidden;
  position: relative;
}

/* Accent strip along the top of the hero. */
.ml-hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--ml-accent) 0%, transparent 85%);
  pointer-events: none;
}

.ml-hero-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 24px;
  text-align: center;
}

.ml-hero-logo {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  border: 1px solid color-mix(in srgb, var(--ml-accent) 35%, transparent);
}

.ml-hero-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ml-hero-title {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: 0.01em;
}

.ml-hero-tagline {
  font-size: 0.95rem;
  color: var(--color-secondary-text);
  max-width: 40ch;
}

.ml-tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.ml-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-height: 148px;
  padding: 22px;
  border-radius: 14px;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--ml-accent) 22%, transparent);
  background-color: color-mix(in srgb, var(--ml-accent) 8%, rgba(var(--v-theme-surface), 0.6));
  transition: transform 0.15s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.ml-tile:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--ml-accent) 55%, transparent);
  background-color: color-mix(in srgb, var(--ml-accent) 16%, rgba(var(--v-theme-surface), 0.6));
}

.ml-tile:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: 2px;
}

.ml-tile-icon {
  color: var(--ml-accent);
}

.ml-tile-title {
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.1;
}

.ml-tile-hint {
  font-size: 0.85rem;
  color: var(--color-secondary-text);
  line-height: 1.35;
}

/* The self-update tile spans both columns so it reads as a distinct action. */
.ml-tile-update {
  grid-column: 1 / -1;
}

/* Live "new version available" dot next to the update tile title. */
.ml-tile-badge {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-left: 8px;
  border-radius: 50%;
  vertical-align: middle;
  background-color: var(--ml-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ml-accent) 25%, transparent);
}

/* Narrow windows stack the tiles into a single column. */
@media (max-width: 700px) {
  .ml-tiles {
    grid-template-columns: minmax(0, 1fr);
  }

  .ml-tile {
    min-height: 112px;
  }
}
</style>
