<!--
  MineLatino right panel: who is playing and with which profile — the skin,
  the account name, the version the next launch will use, and one button that
  opens the edit drawer (pick another profile, add a version, or open the
  profile's own settings).

  Injects `kMineLatino` from `MineLatinoShell.vue` for the accent colour and
  `kInstances` / `kUserContext` from the main window context.
-->
<template>
  <aside class="ml-right flex flex-col p-3">
    <div class="ml-right-card flex flex-col gap-3">
      <div>
        <div class="ml-right-label">
          {{ t('MineLatinoShell.playingAs') }}
        </div>
        <button
          type="button"
          class="ml-right-user"
          data-testid="minelatino-account"
          :aria-label="accountLabel"
          @click="onAccount"
        >
          <PlayerAvatar
            class="overflow-hidden rounded-lg"
            :src="skinUrl"
            :dimension="44"
          />
          <span class="min-w-0 flex-grow text-left">
            <span class="ml-right-name">{{ accountLabel }}</span>
            <span class="ml-right-sub">{{ accountSub }}</span>
          </span>
          <v-icon size="18" aria-hidden="true">
            {{ isSignedIn ? 'expand_more' : 'login' }}
          </v-icon>
        </button>
      </div>

      <v-divider />

      <div>
        <div class="ml-right-label">
          {{ t('MineLatinoShell.profileVersion') }}
        </div>
        <div v-if="selected" class="ml-right-profile">
          <img
            class="ml-right-profile-icon"
            :src="iconOf(selected)"
            :alt="selected.name"
            draggable="false"
          >
          <span class="min-w-0 flex-grow">
            <span class="ml-right-name">{{ selected.name }}</span>
            <span class="ml-right-tags">
              <span v-for="rt in runtimesOf(selected)" :key="rt.text" class="ml-tag">
                <img :src="rt.icon" :alt="rt.text" class="ml-tag-icon" draggable="false">
                {{ rt.text }}
              </span>
            </span>
          </span>
        </div>
        <div v-else class="ml-right-empty">
          {{ t('MineLatinoShell.noSelectedProfile') }}
        </div>

        <v-btn
          block
          size="small"
          variant="tonal"
          :color="accentColor || 'primary'"
          class="mt-2"
          data-testid="minelatino-edit-profile"
          @click="drawer = true"
        >
          <v-icon start size="16" aria-hidden="true">
            tune
          </v-icon>
          {{ t('MineLatinoShell.editProfile') }}
        </v-btn>
      </div>
    </div>

    <!-- The "apartado" the edit button opens: profile picker plus the two
         actions that change what the next launch runs. -->
    <v-navigation-drawer
      v-model="drawer"
      temporary
      location="right"
      width="340"
      class="ml-drawer"
    >
      <div class="flex h-full flex-col gap-3 p-4">
        <div class="flex items-center gap-2">
          <span class="text-base font-bold">{{ t('MineLatinoShell.editProfile') }}</span>
          <div class="flex-grow" />
          <v-btn icon variant="text" size="small" :aria-label="t('MineLatinoHome.close')" @click="drawer = false">
            <v-icon aria-hidden="true"> close </v-icon>
          </v-btn>
        </div>

        <div class="visible-scroll flex flex-1 flex-col gap-1 overflow-y-auto">
          <div v-if="instances.length === 0" class="ml-right-empty py-6 text-center">
            {{ t('MineLatinoPlay.noProfile') }}
          </div>
          <button
            v-for="inst in instances"
            :key="inst.path"
            type="button"
            class="ml-drawer-item"
            :class="{ 'ml-drawer-item--active': inst.path === selectedInstance }"
            @click="selectProfile(inst.path)"
          >
            <img class="ml-drawer-icon" :src="iconOf(inst)" :alt="inst.name" draggable="false">
            <span class="min-w-0 flex-grow text-left">
              <span class="ml-right-name">{{ inst.name }}</span>
              <span class="ml-right-tags">
                <span v-for="rt in runtimesOf(inst)" :key="rt.text" class="ml-tag">
                  <img :src="rt.icon" :alt="rt.text" class="ml-tag-icon" draggable="false">
                  {{ rt.text }}
                </span>
              </span>
            </span>
            <v-icon v-if="inst.path === selectedInstance" size="18" color="primary" aria-hidden="true">
              check_circle
            </v-icon>
          </button>
        </div>

        <div class="flex flex-col gap-2">
          <v-btn
            block
            size="small"
            variant="tonal"
            :color="accentColor || 'primary'"
            data-testid="minelatino-add-version"
            @click="showAddInstance()"
          >
            <v-icon start size="16" aria-hidden="true"> add </v-icon>
            {{ t('MineLatinoPlay.addVersion') }}
          </v-btn>
          <v-btn
            block
            size="small"
            variant="text"
            :disabled="!selected"
            @click="onProfileSettings"
          >
            <v-icon start size="16" aria-hidden="true">
              settings
            </v-icon>
            {{ t('MineLatinoShell.profileSettings') }}
          </v-btn>
        </div>
      </div>
    </v-navigation-drawer>
  </aside>
</template>
<script lang="ts" setup>
import PlayerAvatar from '@/components/PlayerAvatar.vue'
import { useDialog } from '@/composables/dialog'
import { AddInstanceDialogKey } from '@/composables/instanceTemplates'
import { kInstances } from '@/composables/instances'
import { kMineLatino } from '@/composables/minelatino'
import { kUserContext } from '@/composables/user'
import { useUserMenuControl } from '@/composables/userMenu'
import { BuiltinImages } from '@/constant'
import { getInstanceIcon } from '@/util/favicon'
import { injection } from '@/util/inject'
import type { InstanceData } from '@xmcl/instance'

const { t } = useI18n()
const router = useRouter()
const { accentColor } = injection(kMineLatino)
const { instances, selectedInstance } = injection(kInstances)
const { userProfile, gameProfile } = injection(kUserContext)
const userMenu = useUserMenuControl()
const { show: showAddInstance } = useDialog(AddInstanceDialogKey)

const drawer = ref(false)

const skinUrl = computed(() => gameProfile.value.textures.SKIN.url)
const isSignedIn = computed(() => !!userProfile.value.id)
const accountLabel = computed(() =>
  isSignedIn.value
    ? (gameProfile.value.name || userProfile.value.username)
    : t('MineLatinoPlay.login'),
)
const accountSub = computed(() =>
  isSignedIn.value ? t('MineLatinoShell.accountHint') : t('MineLatinoPlay.login'),
)

const selected = computed(() =>
  instances.value.find(i => i.path === selectedInstance.value),
)

function onAccount() {
  userMenu.show(isSignedIn.value ? 'overview' : 'login')
}

function selectProfile(path: string) {
  selectedInstance.value = path
}

function onProfileSettings() {
  drawer.value = false
  router.push('/base-setting')
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
</script>

<style scoped>
.ml-right {
  width: 264px;
  flex-grow: 0;
  flex-shrink: 0;
  border-left: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background-color: color-mix(in srgb, rgb(var(--v-theme-surface)) 55%, transparent);
}

.ml-right-card {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--ml-accent) 22%, transparent);
  background-color: color-mix(in srgb, var(--ml-accent) 7%, rgba(var(--v-theme-surface), 0.6));
}

.ml-right-label {
  margin-bottom: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-secondary-text);
}

.ml-right-user {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.ml-right-user:hover {
  background-color: color-mix(in srgb, var(--ml-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--ml-accent) 35%, transparent);
}

.ml-right-user:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: -2px;
}

.ml-right-name {
  display: block;
  font-size: 0.9rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-right-sub {
  display: block;
  font-size: 0.74rem;
  color: var(--color-secondary-text);
}

.ml-right-profile {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ml-right-profile-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
}

.ml-right-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
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

.ml-right-empty {
  padding: 8px 4px;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--color-secondary-text);
}

.ml-drawer-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.ml-drawer-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
}

.ml-drawer-item--active {
  border-color: color-mix(in srgb, var(--ml-accent) 45%, transparent);
  background-color: color-mix(in srgb, var(--ml-accent) 12%, transparent);
}

.ml-drawer-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
}
</style>
