<!--
  MineLatino left rail: the launcher's whole navigation in one column — the
  four content destinations (Jugar / Anuncios / Actualizaciones / Tienda), the
  player's three most-played profiles, and the session actions at the bottom
  (options, launcher self-update, sign out).

  Injects `kInstances` from the main window context; "most played" is simply
  the instance list sorted by the `playtime` the runtime accumulates per
  profile.
-->
<template>
  <nav
    class="ml-side visible-scroll flex flex-col gap-4 overflow-y-auto p-3"
    :aria-label="t('MineLatinoPlay.startTitle')"
  >
    <!-- The four content destinations. -->
    <div class="flex flex-col gap-1">
      <RouterLink
        v-for="item in nav"
        :key="item.key"
        class="ml-side-item"
        :class="{ 'ml-side-item--active': isActive(item.to) }"
        :to="item.to"
        :data-testid="`minelatino-nav-${item.key}`"
      >
        <v-icon size="20" aria-hidden="true">
          {{ item.icon }}
        </v-icon>
        <span class="ml-side-label">{{ t(`MineLatinoNav.${item.key}`) }}</span>
      </RouterLink>
    </div>

    <!-- The three profiles the player has spent the most time in. -->
    <div class="flex flex-col gap-1">
      <div class="ml-side-title">
        {{ t('MineLatinoShell.mostPlayed') }}
      </div>
      <template v-if="topPlayed.length > 0">
        <button
          v-for="inst in topPlayed"
          :key="inst.path"
          type="button"
          class="ml-side-profile"
          :class="{ 'ml-side-profile--active': inst.path === selectedInstance }"
          :title="inst.name"
          @click="select(inst.path)"
        >
          <img
            class="ml-side-profile-icon"
            :src="iconOf(inst)"
            :alt="inst.name"
            draggable="false"
          >
          <span class="ml-side-profile-text min-w-0 flex-grow">
            <span class="ml-side-profile-name">{{ inst.name }}</span>
            <span class="ml-side-profile-time">{{ playtimeOf(inst) }}</span>
          </span>
        </button>
      </template>
      <div v-else class="ml-side-empty">
        {{ t('MineLatinoShell.mostPlayedEmpty') }}
      </div>
    </div>

    <div class="flex-grow" />

    <!-- Session actions, pinned to the bottom of the rail. -->
    <div class="flex flex-col gap-1">
      <button
        type="button"
        class="ml-side-item"
        data-testid="minelatino-options"
        @click="router.push('/setting')"
      >
        <v-icon size="20" aria-hidden="true">
          settings
        </v-icon>
        <span class="ml-side-label">{{ t('MineLatinoShell.options') }}</span>
      </button>

      <RouterLink
        class="ml-side-item"
        to="/minelatino/actualizar"
        data-testid="minelatino-update"
      >
        <v-icon size="20" aria-hidden="true">
          system_update
        </v-icon>
        <span class="ml-side-label">{{ t('MineLatinoNav.actualizar') }}</span>
        <span
          v-if="updateAvailable"
          class="ml-side-dot"
          :title="updateHint"
          aria-hidden="true"
        />
      </RouterLink>

      <button
        type="button"
        class="ml-side-item ml-side-item--danger"
        :disabled="!isSignedIn"
        data-testid="minelatino-logout"
        @click="logoutDialog = true"
      >
        <v-icon size="20" aria-hidden="true">
          logout
        </v-icon>
        <span class="ml-side-label">{{ t('MineLatinoShell.logout') }}</span>
      </button>
    </div>

    <!-- XMCL has no session token to drop: signing out removes the account
         from the launcher, hence the confirmation. -->
    <SimpleDialog
      v-model="logoutDialog"
      :title="t('MineLatinoShell.logoutTitle')"
      :width="360"
      @confirm="onLogout"
    >
      {{ t('MineLatinoShell.logoutText') }}
    </SimpleDialog>
  </nav>
</template>
<script lang="ts" setup>
import SimpleDialog from '@/components/SimpleDialog.vue'
import { useService } from '@/composables'
import { kInstances } from '@/composables/instances'
import { useUpdateSettings } from '@/composables/setting'
import { kUserContext } from '@/composables/user'
import { TimeUnit, getHumanizeDuration } from '@/util/date'
import { getInstanceIcon } from '@/util/favicon'
import { injection } from '@/util/inject'
import { UserServiceKey } from '@xmcl/runtime-api'
import type { UserProfile } from '@xmcl/runtime-api'
import type { Instance } from '@xmcl/instance'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const { instances, selectedInstance } = injection(kInstances)
const { userProfile } = injection(kUserContext)
const { removeUser } = useService(UserServiceKey)

const nav = [
  { key: 'jugar', icon: 'play_arrow', to: '/minelatino/jugar' },
  { key: 'anuncios', icon: 'campaign', to: '/minelatino/anuncios' },
  { key: 'actualizaciones', icon: 'new_releases', to: '/minelatino/actualizaciones' },
  { key: 'tienda', icon: 'storefront', to: '/minelatino/tienda' },
]

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}

function select(path: string) {
  selectedInstance.value = path
  router.push('/minelatino/jugar')
}

function iconOf(inst: Instance) {
  return getInstanceIcon(inst, undefined)
}

/** "3 horas" style label, mirroring the instance page's playtime item. */
function playtimeOf(inst: Instance) {
  if (!inst.playtime) return t('instance.neverPlayed')
  const [text, value, unit] = getHumanizeDuration(inst.playtime)
  switch (unit) {
    case TimeUnit.Hour:
      return t('duration.hour', { duration: text }, { plural: value })
    case TimeUnit.Minute:
      return t('duration.minute', { duration: text }, { plural: value })
    case TimeUnit.Second:
      return t('duration.second', { duration: text }, { plural: value })
    case TimeUnit.Day:
    default:
      return t('duration.day', { duration: text }, { plural: value })
  }
}

/** The three profiles with the most accumulated play time. */
const topPlayed = computed(() =>
  instances.value
    .filter(i => i.playtime > 0)
    .sort((a, b) => b.playtime - a.playtime)
    .slice(0, 3),
)

// Same shared settings state the updater writes to, so the dot reflects the
// startup check without this rail fetching anything of its own.
const { updateStatus, updateInfo } = useUpdateSettings()
const updateAvailable = computed(() => updateStatus.value !== 'none' && !!updateInfo.value?.newUpdate)
const updateHint = computed(() => updateInfo.value?.name || t('MineLatinoUpdate.available'))

const isSignedIn = computed(() => !!userProfile.value.id)
const logoutDialog = ref(false)

async function onLogout() {
  const id = userProfile.value.id
  if (!id) return
  await removeUser({ id } as UserProfile)
  logoutDialog.value = false
}
</script>

<style scoped>
.ml-side {
  width: 224px;
  flex-grow: 0;
  flex-shrink: 0;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background-color: color-mix(in srgb, rgb(var(--v-theme-surface)) 55%, transparent);
}

.ml-side-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid transparent;
  background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0));
  transition:
    background-color 0.18s ease, color 0.18s ease, border-color 0.18s ease,
    transform 0.16s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease;
}

.ml-side-item:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  transform: translateX(3px);
  box-shadow: 0 8px 18px -12px rgba(0, 0, 0, 0.7);
}

.ml-side-item:active {
  transform: translateX(1px) scale(0.98);
}

.ml-side-item:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: -2px;
}

.ml-side-item--active {
  background-color: color-mix(in srgb, var(--ml-accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--ml-accent) 40%, transparent);
  color: var(--ml-accent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 8px 20px -14px color-mix(in srgb, var(--ml-accent) 90%, transparent);
}

.ml-side-item--danger:hover {
  background-color: color-mix(in srgb, rgb(var(--v-theme-error)) 14%, transparent);
  color: rgb(var(--v-theme-error));
}

.ml-side-item[disabled] {
  opacity: 0.45;
  cursor: default;
  pointer-events: none;
}

.ml-side-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Live "new launcher version" dot on the Actualizar row. */
.ml-side-dot {
  width: 8px;
  height: 8px;
  margin-left: auto;
  border-radius: 50%;
  background-color: var(--ml-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ml-accent) 25%, transparent);
  flex-grow: 0;
  flex-shrink: 0;
}

.ml-side-title {
  padding: 0 10px 2px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-secondary-text);
}

.ml-side-empty {
  padding: 6px 10px;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--color-secondary-text);
}

.ml-side-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.18s ease, border-color 0.18s ease,
    transform 0.16s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease;
}

.ml-side-profile:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  transform: translateX(3px);
  box-shadow: 0 8px 18px -12px rgba(0, 0, 0, 0.7);
}

.ml-side-profile:active {
  transform: translateX(1px) scale(0.98);
}

.ml-side-profile:focus-visible {
  outline: 2px solid var(--ml-accent);
  outline-offset: -2px;
}

.ml-side-profile--active {
  border-color: color-mix(in srgb, var(--ml-accent) 45%, transparent);
  background-color: color-mix(in srgb, var(--ml-accent) 12%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.ml-side-profile-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  flex-grow: 0;
  flex-shrink: 0;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
}

.ml-side-profile-text {
  display: flex;
  flex-direction: column;
}

.ml-side-profile-name {
  font-size: 0.85rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-side-profile-time {
  font-size: 0.72rem;
  color: var(--color-secondary-text);
}
</style>
