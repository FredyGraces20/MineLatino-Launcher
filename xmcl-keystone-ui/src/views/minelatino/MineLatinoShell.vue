<!--
  MineLatino shell: the root of the branded big-tile interface.

  It owns the single `useMineLatino()` subscription for the whole subtree and
  `provide`s it, so the start screen and every child (Jugar / Tienda / Anuncios
  / Actualizaciones / Actualizar) plus the reused `MineLatinoNews` / `MineLatinoUpdates` /
  `MineLatinoPresets` panels all inject the same state instead of re-fetching.

  The slim sticky header (logo + section title + back) is shown only on the
  child screens; the start screen carries its own hero, so a second header
  there would just duplicate the branding. `windows/main/Context.ts` only routes
  here when `isMineLatinoConfigured`, and an unbranded build never mounts this.
-->
<template>
  <div
    class="ml-shell visible-scroll relative flex max-h-full flex-1 flex-col overflow-x-hidden"
    :style="[accentStyle, { scrollbarGutter: 'stable' }]"
  >
    <header
      v-if="!isStart"
      class="ml-header sticky top-0 z-20"
      :style="{ 'backdrop-filter': `blur(${blurCard}px)` }"
    >
      <v-btn
        icon
        variant="text"
        size="small"
        class="ml-back non-moveable"
        data-testid="minelatino-back"
        :aria-label="t('MineLatinoPlay.back')"
        @click="goBack"
      >
        <v-icon aria-hidden="true"> arrow_back </v-icon>
      </v-btn>
      <img
        class="ml-header-logo"
        :src="logoSrc"
        :alt="brandName"
        draggable="false"
      >
      <span class="ml-header-title">{{ sectionTitle }}</span>
    </header>

    <router-view v-slot="{ Component }">
      <transition name="fade-transition" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>
<script lang="ts" setup>
import bundledLogo from '@/assets/minelatino-logo.png'
import { kMineLatino, useMineLatino } from '@/composables/minelatino'
import { kTheme } from '@/composables/theme'
import { injection } from '@/util/inject'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { blurCard } = injection(kTheme)

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

/** Last path segment: '' for the start screen, `jugar`/`tienda`/... otherwise. */
const segment = computed(() => route.path.split('/').filter(Boolean).pop() ?? '')

const TITLES: Record<string, string> = {
  jugar: 'MineLatinoNav.jugar',
  tienda: 'MineLatinoNav.tienda',
  anuncios: 'MineLatinoNav.anuncios',
  actualizaciones: 'MineLatinoNav.actualizaciones',
  actualizar: 'MineLatinoNav.actualizar',
}

const isStart = computed(() => !TITLES[segment.value])
const sectionTitle = computed(() => {
  const key = TITLES[segment.value]
  return key ? t(key) : brandName.value
})

function goBack() {
  router.push('/minelatino')
}
</script>

<style scoped>
.ml-shell {
  /* Falls back to the theme primary when the backend sends no accent colour. */
  --ml-accent: rgb(var(--v-theme-primary));
}

.ml-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-grow: 0;
  flex-shrink: 0;
  height: 52px;
  padding: 0 12px;
  background-color: color-mix(in srgb, rgb(var(--v-theme-surface)) 72%, transparent);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.ml-back {
  flex-grow: 0;
  flex-shrink: 0;
}

.ml-header-logo {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
}

.ml-header-title {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
