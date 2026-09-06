<template>
  <section
    v-if="isConfigured"
    data-testid="minelatino-home"
    class="ml-root mb-4 mt-2"
    :style="accentStyle"
  >
    <v-alert
      v-if="maintenance && maintenance.enabled"
      class="mb-3"
      type="warning"
      variant="tonal"
      density="compact"
      :title="t('MineLatinoHome.maintenanceTitle')"
      :text="maintenance.message"
    />

    <!-- Hero: branding plus the server address the Play button will join. -->
    <v-card
      class="ml-hero"
      :color="cardColor"
      :style="heroStyle"
    >
      <div class="ml-hero-body">
        <v-avatar size="64" rounded="lg" class="ml-hero-logo">
          <img
            v-if="branding && branding.logoUrl"
            :src="branding.logoUrl"
            :alt="branding.name"
            draggable="false"
            v-fallback-img="BuiltinImages.minecraft"
          />
          <img
            v-else
            :src="BuiltinImages.minecraft"
            :alt="serverName"
            draggable="false"
          />
        </v-avatar>

        <div class="min-w-0 flex-grow">
          <h1 class="ml-hero-title">{{ branding?.name || serverName }}</h1>
          <div v-if="branding?.tagline" class="ml-hero-tagline">{{ branding.tagline }}</div>

          <div v-if="autoJoinAddress" class="mt-2 flex flex-wrap items-center gap-2">
            <!--
              A plain button rather than a `v-chip`: Vuetify would apply its own
              colour inline, which cannot be overridden by the backend accent
              from scoped CSS.
            -->
            <button
              type="button"
              class="ml-address"
              :title="t('MineLatinoHome.serverAddressHint')"
              data-testid="minelatino-address"
              @click="onCopyAddress"
            >
              <v-icon size="small" aria-hidden="true"> dns </v-icon>
              <span class="ml-address-text">{{ autoJoinAddress }}</span>
              <v-icon size="small" aria-hidden="true">
                {{ addressCopied ? 'check' : 'content_copy' }}
              </v-icon>
            </button>
            <v-chip
              v-if="canAutoJoin"
              size="small"
              variant="tonal"
              color="success"
              :title="t('MineLatinoHome.autoJoinHint')"
            >
              <v-icon start size="small" aria-hidden="true"> bolt </v-icon>
              {{ t('MineLatinoHome.autoJoin') }}
            </v-chip>
          </div>
        </div>

        <!-- Reuses the shared launch state machine, so this button and the one in
             the app bar can never disagree about account/Java/install state. -->
        <HomeLaunchButton class="ml-hero-play" />
      </div>

      <v-divider />

      <div class="ml-actions">
        <!--
          Toggles: the store lives in its own `BrowserWindow`, so once it is open
          the useful action is closing it. Re-opening would only re-focus it.
        -->
        <v-btn
          v-if="hasStore"
          :color="accentColor || 'primary'"
          :variant="isStoreOpen ? 'tonal' : 'flat'"
          size="small"
          data-testid="minelatino-store"
          @click="isStoreOpen ? closeStore() : openStore()"
        >
          <v-icon start aria-hidden="true">
            {{ isStoreOpen ? 'close' : 'storefront' }}
          </v-icon>
          {{ isStoreOpen ? t('MineLatinoHome.closeStore') : t('MineLatinoHome.store') }}
        </v-btn>

        <v-btn
          v-for="tab in storeTabs"
          :key="`tab-${tab.url}`"
          variant="tonal"
          :color="accentColor"
          size="small"
          @click="openTab(tab)"
        >
          <v-icon v-if="tab.icon" start aria-hidden="true"> {{ tab.icon }} </v-icon>
          {{ tab.label }}
        </v-btn>

        <v-btn
          v-for="link in links"
          :key="`link-${link.url}`"
          variant="text"
          size="small"
          @click="openTab(link)"
        >
          <v-icon v-if="link.icon" start aria-hidden="true"> {{ link.icon }} </v-icon>
          {{ link.label }}
        </v-btn>

        <v-btn
          v-if="newsInviteUrl"
          variant="text"
          size="small"
          @click="openInBrowser(newsInviteUrl)"
        >
          <v-icon start aria-hidden="true"> xmcl:discord </v-icon>
          {{ t('MineLatinoHome.discord') }}
        </v-btn>

        <div class="flex-grow" />

        <!--
          Bedrock players cannot be launched from a Java launcher, so the most
          useful thing here is the official deep link, ready to paste or share.
        -->
        <v-btn
          v-if="bedrockDeepLink"
          variant="text"
          size="small"
          :title="bedrockDeepLink"
          @click="onCopyBedrock"
        >
          <v-icon start aria-hidden="true">
            {{ bedrockCopied ? 'check' : 'phone_iphone' }}
          </v-icon>
          {{ bedrockCopied ? t('MineLatinoHome.copied') : t('MineLatinoHome.bedrock') }}
        </v-btn>
      </div>
    </v-card>

    <!-- "Crear perfil MineLatino": the operator's ready-made instances. Hidden
         entirely when the backend sends no presets. -->
    <MineLatinoPresets class="mt-3" />

    <div v-if="newsEnabled || updatesEnabled" class="ml-panels mt-3">
      <MineLatinoNews v-if="newsEnabled" class="ml-panel-news" />
      <MineLatinoUpdates v-if="updatesEnabled" class="ml-panel-updates" />
    </div>
  </section>
</template>
<script lang="ts" setup>
import { kMineLatino, useMineLatino } from '@/composables/minelatino'
import { kTheme } from '@/composables/theme'
import { BuiltinImages } from '@/constant'
import { vFallbackImg } from '@/directives/fallbackImage'
import { injection } from '@/util/inject'
import HomeLaunchButton from '../HomeLaunchButton.vue'
import MineLatinoNews from './MineLatinoNews.vue'
import MineLatinoPresets from './MineLatinoPresets.vue'
import MineLatinoUpdates from './MineLatinoUpdates.vue'

const { t } = useI18n()
const { cardColor, blurCard } = injection(kTheme)

const state = useMineLatino()
// One subscription for the whole subtree: the panels inject this instead of each
// calling `useService` and re-fetching on their own.
provide(kMineLatino, state)

const {
  branding,
  server,
  links,
  maintenance,
  accentColor,
  newsEnabled,
  updatesEnabled,
  newsInviteUrl,
  autoJoinAddress,
  canAutoJoin,
  bedrockDeepLink,
  hasStore,
  storeTabs,
  isStoreOpen,
  isConfigured,
  openStore,
  closeStore,
  openTab,
  openInBrowser,
  copyText,
} = state

const serverName = computed(() => server.value?.name || 'MineLatino')

/**
 * The accent colour comes from the backend so rebranding does not need a new
 * installer. It is exposed as a CSS variable rather than written into the
 * Vuetify theme, which would leak into every other view.
 */
const accentStyle = computed(() => accentColor.value ? { '--ml-accent': accentColor.value } : {})

/**
 * Hero art, when the backend supplies one.
 *
 * Only `http(s)` and `data:image/` URLs survive, and anything containing a
 * quote, parenthesis, backslash or whitespace is dropped, because the value is
 * interpolated into a `url("...")` wrapper and must not be able to break out
 * of it.
 */
const heroBackground = computed(() => {
  const url = branding.value?.backgroundUrl
  if (!url) return ''
  if (!/^(?:https?:\/\/|data:image\/)/i.test(url)) return ''
  return /["'()\s\\]/.test(url) ? '' : url
})

/**
 * The scrim is built from the theme's own surface colour instead of a fixed
 * black overlay, so the title and tagline keep their contrast in both light
 * and dark themes whatever art the backend sends.
 */
const heroStyle = computed(() => {
  const style: Record<string, string> = { 'backdrop-filter': `blur(${blurCard}px)` }
  if (heroBackground.value) {
    const scrim = 'linear-gradient('
      + 'color-mix(in srgb, rgb(var(--v-theme-surface)) 72%, transparent),'
      + 'color-mix(in srgb, rgb(var(--v-theme-surface)) 86%, transparent))'
    style['background-image'] = `${scrim}, url("${heroBackground.value}")`
    style['background-size'] = 'cover'
    style['background-position'] = 'center'
  }
  return style
})

const addressCopied = ref(false)
const bedrockCopied = ref(false)

/** Resets the "copied" tick so the icon can be reused on the next click. */
function flashCopied(flag: Ref<boolean>) {
  flag.value = true
  setTimeout(() => { flag.value = false }, 2000)
}

function onCopyAddress() {
  if (copyText(autoJoinAddress.value)) flashCopied(addressCopied)
}

function onCopyBedrock() {
  if (copyText(bedrockDeepLink.value)) flashCopied(bedrockCopied)
}
</script>

<style scoped>
.ml-root {
  /* Falls back to the theme primary when the backend sends no accent colour. */
  --ml-accent: rgb(var(--v-theme-primary));
}

.ml-hero {
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

/* Accent strip along the top of the hero: the strongest, cheapest way to make
   the backend colour readable without repainting the whole card. */
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
  align-items: center;
  gap: 16px;
  padding: 16px;
}

.ml-hero-logo {
  flex-grow: 0;
  flex-shrink: 0;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  border: 1px solid color-mix(in srgb, var(--ml-accent) 35%, transparent);
}

.ml-hero-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ml-hero-title {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-hero-tagline {
  font-size: 0.85rem;
  color: var(--color-secondary-text);
  margin-top: 2px;
}

.ml-hero-play {
  flex-grow: 0;
  flex-shrink: 0;
}

.ml-address {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid color-mix(in srgb, var(--ml-accent) 35%, transparent);
  border-radius: 999px;
  background-color: color-mix(in srgb, var(--ml-accent) 16%, transparent);
  color: var(--ml-accent);
  font: inherit;
  font-size: 0.8rem;
  font-family: 'Roboto Mono', monospace;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.ml-address:hover {
  background-color: color-mix(in srgb, var(--ml-accent) 26%, transparent);
  border-color: color-mix(in srgb, var(--ml-accent) 55%, transparent);
}

.ml-address:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: 2px;
}

.ml-address-text {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
}

.ml-panels {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

/* Narrow windows stack the panels instead of squeezing the news column. */
@media (max-width: 1100px) {
  .ml-panels {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .ml-hero-body {
    flex-wrap: wrap;
  }

  .ml-hero-play {
    width: 100%;
    justify-content: center;
  }
}
</style>
