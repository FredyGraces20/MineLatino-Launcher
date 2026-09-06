<!--
  MineLatino "Jugar" screen: everything the player needs to get into the server
  on one page — account, the launcher settings, the profile/version picker, the
  operator's ready-made presets, shortcuts to mods/resource packs/shaders, and
  the big "Entrar" launch button.

  It reuses XMCL's own screens and state machines rather than reinventing them:
  the profile list is `kInstances`, selection writes `selectedInstance`, the
  shortcuts route to the stock `/mods`, `/resourcepacks`, `/shaderpacks`, and the
  launch button is the shared `<HomeLaunchButton>` (which already auto-joins the
  MineLatino server through `instanceLaunch.ts`). `kMineLatino` is injected from
  `MineLatinoShell.vue`.
-->
<template>
  <div
    v-if="isConfigured"
    data-testid="minelatino-play"
    class="ml-play flex flex-col gap-4 p-4"
  >
    <v-alert
      v-if="maintenance && maintenance.enabled"
      type="warning"
      variant="tonal"
      density="compact"
      :title="t('MineLatinoHome.maintenanceTitle')"
      :text="maintenance.message"
    />

    <!-- Account (opens login when signed out, the profile overview otherwise)
         plus the launcher settings. -->
    <div class="ml-topbar">
      <button
        type="button"
        class="ml-account"
        data-testid="minelatino-account"
        :title="t('MineLatinoPlay.account')"
        :aria-label="accountLabel"
        @click="onAccount"
      >
        <PlayerAvatar
          class="ml-account-avatar overflow-hidden rounded-full"
          :src="skinUrl"
          :dimension="30"
        />
        <span class="ml-account-name">{{ accountLabel }}</span>
        <v-icon size="small" aria-hidden="true">
          {{ isSignedIn ? 'expand_more' : 'login' }}
        </v-icon>
      </button>

      <div class="flex-grow" />

      <v-btn
        icon
        variant="text"
        data-testid="minelatino-settings"
        :aria-label="t('MineLatinoPlay.settings')"
        @click="router.push('/setting')"
      >
        <v-icon aria-hidden="true"> settings </v-icon>
      </v-btn>
    </div>

    <!-- Profile / version picker. -->
    <v-card
      class="ml-panel"
      :color="cardColor"
      :style="{ 'backdrop-filter': `blur(${blurCard}px)` }"
    >
      <v-card-item class="pb-2">
        <v-card-title class="flex items-center gap-2 text-base">
          <v-icon size="small" :color="accentColor || 'primary'"> inventory_2 </v-icon>
          {{ t('MineLatinoPlay.chooseProfile') }}
        </v-card-title>
      </v-card-item>

      <v-card-text class="pt-0">
        <div v-if="instances.length === 0" class="ml-empty">
          <v-icon size="32" color="grey"> inventory </v-icon>
          <div class="mt-2 text-body-2 text-grey">
            {{ t('MineLatinoPlay.noProfile') }}
          </div>
        </div>

        <div v-else class="ml-profiles">
          <div
            v-for="inst in instances"
            :key="inst.path"
            class="ml-profile"
            :class="{ 'ml-profile--active': inst.path === selectedInstance }"
            role="button"
            tabindex="0"
            :aria-pressed="inst.path === selectedInstance"
            @click="selectProfile(inst.path)"
            @keydown.enter="selectProfile(inst.path)"
            @keydown.space.prevent="selectProfile(inst.path)"
          >
            <img
              class="ml-profile-icon"
              :src="iconOf(inst)"
              :alt="inst.name"
              draggable="false"
            >
            <div class="min-w-0 flex-grow">
              <div class="ml-profile-name">
                {{ inst.name }}
              </div>
              <div class="ml-profile-runtime">
                <span
                  v-for="rt in runtimesOf(inst)"
                  :key="rt.text"
                  class="ml-tag"
                >
                  <img :src="rt.icon" :alt="rt.text" class="ml-tag-icon" draggable="false">
                  {{ rt.text }}
                </span>
              </div>
            </div>
            <v-icon
              v-if="inst.path === selectedInstance"
              class="ml-profile-check"
              size="20"
              aria-hidden="true"
            >
              check_circle
            </v-icon>
          </div>
        </div>

        <v-btn
          class="mt-3"
          size="small"
          variant="tonal"
          :color="accentColor || 'primary'"
          data-testid="minelatino-add-version"
          @click="showAddInstance()"
        >
          <v-icon start aria-hidden="true"> add </v-icon>
          {{ t('MineLatinoPlay.addVersion') }}
        </v-btn>
      </v-card-text>
    </v-card>

    <!-- One-click server-recommended profiles. Hidden by itself when the
         backend sends no presets. -->
    <MineLatinoPresets />

    <!-- Shortcuts to XMCL's instance screens (need a selected profile). -->
    <div class="ml-shortcuts">
      <v-btn
        variant="tonal"
        size="small"
        :disabled="!hasProfile"
        @click="router.push('/mods')"
      >
        <v-icon start aria-hidden="true"> extension </v-icon>
        {{ t('MineLatinoPlay.mods') }}
      </v-btn>
      <v-btn
        variant="tonal"
        size="small"
        :disabled="!hasProfile"
        @click="router.push('/resourcepacks')"
      >
        <v-icon start aria-hidden="true"> texture </v-icon>
        {{ t('MineLatinoPlay.resourcePacks') }}
      </v-btn>
      <v-btn
        variant="tonal"
        size="small"
        :disabled="!hasProfile"
        @click="router.push('/shaderpacks')"
      >
        <v-icon start aria-hidden="true"> brightness_5 </v-icon>
        {{ t('MineLatinoPlay.shaderPacks') }}
      </v-btn>
    </div>

    <!-- "Entrar": the server address the launch button joins, plus the shared
         launch pill. -->
    <v-card
      class="ml-enter"
      :color="cardColor"
      :style="{ 'backdrop-filter': `blur(${blurCard}px)` }"
    >
      <div class="ml-enter-head">
        <span class="ml-enter-title">{{ t('MineLatinoPlay.entrar') }}</span>
        <div class="flex-grow" />
        <button
          v-if="autoJoinAddress"
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

      <div class="ml-enter-body">
        <HomeLaunchButton />
      </div>
    </v-card>
  </div>
</template>
<script lang="ts" setup>
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { useDialog } from '@/composables/dialog'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kInstances } from '@/composables/instances'
import { kMineLatino } from '@/composables/minelatino'
import { kTheme } from '@/composables/theme'
import { kUserContext } from '@/composables/user'
import { useUserMenuControl } from '@/composables/userMenu'
import { BuiltinImages } from '@/constant'
import { getInstanceIcon } from '@/util/favicon'
import { injection } from '@/util/inject'
import type { InstanceData } from '@xmcl/instance'
import HomeLaunchButton from '../HomeLaunchButton.vue'
import MineLatinoPresets from './MineLatinoPresets.vue'

const { t } = useI18n()
const router = useRouter()
const { cardColor, blurCard } = injection(kTheme)
const {
  maintenance,
  accentColor,
  autoJoinAddress,
  canAutoJoin,
  isConfigured,
  copyText,
} = injection(kMineLatino)

const { instances, selectedInstance } = injection(kInstances)
const { userProfile, gameProfile } = injection(kUserContext)
const userMenu = useUserMenuControl()
const { show: showAddInstance } = useDialog(AddInstanceDialogKey)

const hasProfile = computed(() => !!selectedInstance.value)

const skinUrl = computed(() => gameProfile.value.textures.SKIN.url)
const isSignedIn = computed(() => !!userProfile.value.id)
const accountLabel = computed(() =>
  isSignedIn.value
    ? (gameProfile.value.name || userProfile.value.username)
    : t('MineLatinoPlay.login'),
)

function onAccount() {
  userMenu.show(isSignedIn.value ? 'overview' : 'login')
}

function selectProfile(path: string) {
  selectedInstance.value = path
}

function iconOf(inst: InstanceData) {
  return getInstanceIcon(inst, undefined)
}

/** Loader/version tags for one instance, mirroring the sidebar item. */
function runtimesOf(inst: InstanceData) {
  const rt = inst.runtime
  const out = [] as { icon: string; text: string }[]
  if (rt.minecraft) out.push({ icon: BuiltinImages.minecraft, text: rt.minecraft })
  if (rt.forge) out.push({ icon: BuiltinImages.forge, text: rt.forge })
  if (rt.neoForged) out.push({ icon: BuiltinImages.neoForged, text: rt.neoForged })
  if (rt.fabricLoader) out.push({ icon: BuiltinImages.fabric, text: rt.fabricLoader })
  if (rt.quiltLoader) out.push({ icon: BuiltinImages.quilt, text: rt.quiltLoader })
  if (rt.optifine) out.push({ icon: BuiltinImages.optifine, text: rt.optifine })
  if (rt.labyMod) out.push({ icon: BuiltinImages.labyMod, text: rt.labyMod })
  return out
}

const addressCopied = ref(false)
function onCopyAddress() {
  if (copyText(autoJoinAddress.value)) {
    addressCopied.value = true
    setTimeout(() => { addressCopied.value = false }, 2000)
  }
}
</script>

<style scoped>
.ml-play {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.ml-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ml-account {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ml-accent) 30%, transparent);
  background-color: color-mix(in srgb, var(--ml-accent) 10%, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.ml-account:hover {
  background-color: color-mix(in srgb, var(--ml-accent) 20%, transparent);
  border-color: color-mix(in srgb, var(--ml-accent) 50%, transparent);
}

.ml-account:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: 2px;
}

.ml-account-avatar {
  flex-grow: 0;
  flex-shrink: 0;
}

.ml-account-name {
  font-size: 0.9rem;
  font-weight: 600;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-panel,
.ml-enter {
  border-radius: 12px;
}

.ml-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  text-align: center;
}

.ml-profiles {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ml-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.ml-profile:hover {
  background-color: color-mix(in srgb, var(--ml-accent) 10%, transparent);
}

.ml-profile:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: -2px;
}

.ml-profile--active {
  border-color: color-mix(in srgb, var(--ml-accent) 55%, transparent);
  background-color: color-mix(in srgb, var(--ml-accent) 16%, transparent);
}

.ml-profile-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
}

.ml-profile-name {
  font-weight: 600;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-profile-runtime {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.ml-profile-check {
  color: var(--ml-accent);
  flex-grow: 0;
  flex-shrink: 0;
}

.ml-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  background-color: color-mix(in srgb, var(--ml-accent) 14%, transparent);
  color: var(--ml-accent);
}

.ml-tag-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
}

.ml-shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ml-enter-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px 0;
}

.ml-enter-title {
  font-size: 1rem;
  font-weight: 700;
}

.ml-enter-body {
  display: flex;
  justify-content: center;
  padding: 16px;
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
</style>
