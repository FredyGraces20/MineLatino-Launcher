<template>
  <section class="about">
    <XmclAccountPanel class="mb-4" />
    <SettingCard>
      <div class="pa-4">
        <!-- Logo & Header info -->
        <div class="d-flex align-center flex-wrap gap-4 mb-6">
          <v-img
            :src="logo"
            alt="MineLatino Logo"
            width="64"
            height="64"
            class="mr-4 rounded-lg flex-grow-0 flex-shrink-0"
          ></v-img>
          <div>
            <a
              class="text-h5 font-weight-bold text-decoration-none"
              href="https://minelatino.com"
              target="_blank"
              v-shared-tooltip="() => productName"
            >
              {{ productName }}
            </a>
          </div>
          <v-spacer />
          <div class="d-flex align-center gap-2">
            <v-icon color="primary" size="small">verified</v-icon>
            <div class="text-caption font-weight-medium">{{ t('setting.aboutLicense') }}</div>
          </div>
        </div>
        <div class="text-caption opacity-70 mb-6">
          NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
        </div>

        <!-- Debug Info Box -->
        <div class="mb-8">
          <div class="text-subtitle-2 font-weight-bold mb-2 opacity-80">
            {{ t('setting.about') }}
          </div>
          <pre
            class="debug-info-code pa-4 text-caption font-mono"
          ><code>{{ debugInfo }}</code></pre>
        </div>
      </div>
    </SettingCard>
  </section>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import XmclAccountPanel from '@/components/XmclAccountPanel.vue'
import SettingCard from '@/components/SettingCard.vue'
import { kEnvironment } from '@/composables/environment'
import { kFlights } from '@/composables/flights'
import { useMineLatino } from '@/composables/minelatino'
import { vSharedTooltip } from '@/directives/sharedTooltip'
import { injection } from '@/util/inject'
import logo from '../assets/minelatino-logo.png'

const env = injection(kEnvironment)
const flights = injection(kFlights)

const debugInfo = computed(() => {
  return JSON.stringify({ ...env.value, flights }, null, 2)
})

const { t } = useI18n()
const version = computed(() => env.value?.version ?? '')

// The operator-configured name, with the product name as the offline fallback
// so the page never flashes the upstream launcher's identity.
const { branding } = useMineLatino()
const productName = computed(() => branding.value?.name || 'MineLatino')
</script>

<style scoped>
.debug-info-code {
  background: rgba(0, 0, 0, 0.25);
  border: var(--card-subsection-border);
  border-radius: var(--card-item-radius);
  color: rgba(var(--v-theme-on-surface), 0.85);
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

:deep(.v-img__img) {
  object-fit: contain;
}
</style>
