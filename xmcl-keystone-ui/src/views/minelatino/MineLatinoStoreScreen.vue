<!--
  MineLatino "Tienda" screen.

  The store lives in its own `BrowserWindow` (`openStore()`), not an iframe:
  shops send `X-Frame-Options`/`frame-ancestors` and payment + 3-D Secure
  redirects need to navigate freely. This screen is the branded entry point —
  one big open/close toggle plus the operator's extra windows (`store.tabs`:
  vote, wiki, map...) and general `links`. `kMineLatino` comes from the shell.
-->
<template>
  <div
    v-if="isConfigured"
    data-testid="minelatino-store-screen"
    class="ml-store flex flex-col gap-4 p-4"
  >
    <v-card
      class="ml-panel"
      :color="cardColor"
      :style="{ 'backdrop-filter': `blur(${blurCard}px)` }"
    >
      <div class="ml-store-hero">
        <v-icon size="52" :color="accentColor || 'primary'" aria-hidden="true">
          storefront
        </v-icon>
        <h2 class="ml-store-title">
          {{ storeName }}
        </h2>
        <p class="ml-store-subtitle">
          {{ t('MineLatinoNav.tiendaHint') }}
        </p>

        <v-btn
          v-if="hasStore"
          size="large"
          :color="accentColor || 'primary'"
          :variant="isStoreOpen ? 'tonal' : 'flat'"
          data-testid="minelatino-store-open"
          @click="isStoreOpen ? closeStore() : openStore()"
        >
          <v-icon start aria-hidden="true">
            {{ isStoreOpen ? 'close' : 'storefront' }}
          </v-icon>
          {{ isStoreOpen ? t('MineLatinoHome.closeStore') : t('MineLatinoHome.store') }}
        </v-btn>
      </div>

      <template v-if="storeTabs.length > 0 || links.length > 0">
        <v-divider />
        <div class="ml-store-links">
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
        </div>
      </template>
    </v-card>
  </div>
</template>
<script lang="ts" setup>
import { kMineLatino } from '@/composables/minelatino'
import { kTheme } from '@/composables/theme'
import { injection } from '@/util/inject'

const { t } = useI18n()
const { cardColor, blurCard } = injection(kTheme)
const {
  branding,
  server,
  links,
  accentColor,
  hasStore,
  storeTabs,
  isStoreOpen,
  isConfigured,
  openStore,
  closeStore,
  openTab,
} = injection(kMineLatino)

const storeName = computed(
  () => server.value?.name || branding.value?.name || t('MineLatinoNav.tienda'),
)
</script>

<style scoped>
.ml-store {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.ml-panel {
  border-radius: 14px;
  overflow: hidden;
}

.ml-store-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 24px;
  text-align: center;
}

.ml-store-title {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

.ml-store-subtitle {
  font-size: 0.9rem;
  color: var(--color-secondary-text);
  max-width: 46ch;
  margin-bottom: 6px;
}

.ml-store-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 16px;
}
</style>
