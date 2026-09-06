<!--
  MineLatino shell: the root of the branded interface, laid out as a classic
  game-launcher frame — brand logo and name on a top bar, a left rail with the
  whole navigation (Jugar / Anuncios / Actualizaciones / Tienda, the most
  played profiles and the session actions), the routed screen in the middle,
  and the player's profile panel on the right.

  It owns the single `useMineLatino()` subscription for the whole subtree and
  `provide`s it, so every child (Start / Jugar / Tienda / Anuncios /
  Actualizaciones / Actualizar) plus the reused `MineLatinoNews` /
  `MineLatinoUpdates` / `MineLatinoPresets` panels inject the same state
  instead of re-fetching. `windows/main/Context.ts` only routes here when
  `isMineLatinoConfigured`, and an unbranded build never mounts this.
-->
<template>
  <div
    class="ml-shell flex max-h-full min-h-0 flex-1 flex-col"
    :style="[accentStyle, { scrollbarGutter: 'stable' }]"
  >
    <!-- Brand first: logo and name pinned to the top-left corner. -->
    <header class="ml-topbar flex flex-grow-0 flex-shrink-0 items-center gap-3 px-4">
      <img
        class="ml-topbar-logo"
        :src="logoSrc"
        :alt="brandName"
        draggable="false"
      >
      <span class="ml-topbar-name">{{ brandName }}</span>
      <span v-if="branding?.tagline" class="ml-topbar-tagline">
        {{ branding.tagline }}
      </span>
    </header>

    <div class="ml-body flex min-h-0 flex-1">
      <MineLatinoSidebar />

      <main class="visible-scroll min-w-0 flex-1 overflow-y-auto">
        <router-view v-slot="{ Component }">
          <transition name="fade-transition" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>

      <MineLatinoProfilePanel />
    </div>
  </div>
</template>
<script lang="ts" setup>
import bundledLogo from '@/assets/minelatino-logo.png'
import { kMineLatino, useMineLatino } from '@/composables/minelatino'
import MineLatinoProfilePanel from './MineLatinoProfilePanel.vue'
import MineLatinoSidebar from './MineLatinoSidebar.vue'

const { t } = useI18n()

const state = useMineLatino()
// One subscription shared by the whole subtree (see the comment above).
provide(kMineLatino, state)

const { branding, accentColor } = state

const brandName = computed(() => branding.value?.name || t('MineLatinoPlay.startTitle'))
const logoSrc = computed(() => branding.value?.logoUrl || bundledLogo)

/**
 * The accent colour comes from the backend so rebranding needs no new
 * installer. Exposed as a CSS variable rather than written into the Vuetify
 * theme, which would leak into every other view.
 */
const accentStyle = computed(() => accentColor.value ? { '--ml-accent': accentColor.value } : {})
</script>

<style scoped>
.ml-shell {
  /* Falls back to the theme primary when the backend sends no accent colour. */
  --ml-accent: rgb(var(--v-theme-primary));
}

.ml-topbar {
  height: 56px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background-color: color-mix(in srgb, rgb(var(--v-theme-surface)) 72%, transparent);
}

.ml-topbar-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ml-accent) 35%, transparent);
}

.ml-topbar-name {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-topbar-tagline {
  font-size: 0.8rem;
  color: var(--color-secondary-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-body {
  /* The rails keep their own scroll; the middle column scrolls on its own. */
  background-color: rgba(var(--v-theme-on-surface), 0.02);
}
</style>
