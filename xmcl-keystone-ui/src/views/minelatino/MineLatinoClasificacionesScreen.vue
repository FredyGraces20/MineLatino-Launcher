<!--
  MineLatino "Clasificaciones" screen: the staff-site ranking, embedded.

  The page (`staff.minelatino.net/clasificacion`) is loaded in an inline
  Electron `<webview>` rather than an iframe on purpose: the site answers with
  `X-Frame-Options: DENY` / CSP `frame-ancestors 'self'`, so an iframe renders
  blank, while a `<webview>` is a top-level guest WebContents that ignores those
  framing headers. Being a guest also lets us `insertCSS()` on `dom-ready` to
  hide the site's own chrome (global navbar + footer) so ONLY the ranking is
  visible and interactive — its modality/category filters and pagination keep
  working because they live inside the retained `section.leaderboards-section`.

  The webview is created imperatively (not in the template) because the shared
  `vite.config.ts` registers no `isCustomElement` for `<webview>`, so Vue's
  compiler would fail to resolve the tag. `kMineLatino` comes from the shell.
-->
<template>
  <div
    class="ml-class flex flex-col gap-3 p-4"
    data-testid="minelatino-clasificaciones-screen"
  >
    <div class="ml-class-head flex flex-grow-0 items-center gap-3">
      <v-icon size="22" :color="accentColor || 'primary'" aria-hidden="true">
        emoji_events
      </v-icon>
      <div class="min-w-0">
        <div class="ml-class-title">
          {{ t('MineLatinoClasificaciones.title') }}
        </div>
        <div class="ml-class-subtitle">
          {{ t('MineLatinoClasificaciones.subtitle') }}
        </div>
      </div>
      <div class="flex-grow" />
      <v-btn
        icon
        size="small"
        variant="text"
        data-testid="minelatino-clasificaciones-refresh"
        :aria-label="t('MineLatinoClasificaciones.retry')"
        @click="reload"
      >
        <v-icon aria-hidden="true"> refresh </v-icon>
      </v-btn>
      <v-btn
        icon
        size="small"
        variant="text"
        data-testid="minelatino-clasificaciones-external"
        :aria-label="t('MineLatinoClasificaciones.openExternal')"
        @click="openExternal"
      >
        <v-icon aria-hidden="true"> open_in_new </v-icon>
      </v-btn>
    </div>

    <div class="ml-class-frame flex-grow">
      <!-- The <webview> guest is appended here imperatively (see onMounted). -->
      <div ref="host" class="ml-class-host" />

      <transition name="fade-transition">
        <div v-if="loading && !error" class="ml-class-overlay">
          <v-progress-circular
            indeterminate
            size="28"
            width="3"
            :color="accentColor || 'primary'"
          />
          <span class="ml-class-overlay-text">{{ t('MineLatinoClasificaciones.loading') }}</span>
        </div>
      </transition>

      <div v-if="error" class="ml-class-overlay">
        <v-icon size="36" color="grey" aria-hidden="true"> wifi_off </v-icon>
        <div class="ml-class-overlay-text">
          {{ t('MineLatinoClasificaciones.error') }}
        </div>
        <v-btn
          class="mt-3"
          size="small"
          variant="tonal"
          :color="accentColor || 'primary'"
          @click="reload"
        >
          <v-icon start aria-hidden="true"> refresh </v-icon>
          {{ t('MineLatinoClasificaciones.retry') }}
        </v-btn>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { kMineLatino } from '@/composables/minelatino'
import { injection } from '@/util/inject'

const { t } = useI18n()
const { accentColor, openInBrowser } = injection(kMineLatino)

/**
 * The staff-site ranking page, opened with the default modality/category/page.
 * The embedded filters and pagination rewrite these query params, so the player
 * keeps full control of the ranking from inside the launcher.
 */
const CLASIFICACIONES_URL = 'https://staff.minelatino.net/clasificacion?modalidad=survival-clasico&categoria=blocks&pagina=1'

/**
 * Hides the staff site's global navbar and footer so only the ranking shows.
 * Both a class and a structural (`body > nav` / `body > footer`) selector are
 * used so a minor class rename on the site cannot resurface its chrome. Injected
 * on every `dom-ready` because a full navigation (a filter or pagination reload)
 * swaps the document and clears previously injected CSS.
 */
const HIDE_CHROME_CSS = `
nav.navbar,
footer.modern-footer,
body > nav,
body > footer {
  display: none !important;
}
`

/** The slice of the Electron `<webview>` element this screen drives. */
interface WebviewElement extends HTMLElement {
  src: string
  insertCSS(css: string): Promise<string>
  reload(): void
}

const host = ref<HTMLElement>()
const loading = ref(true)
const error = ref(false)
let webview: WebviewElement | undefined

function reload() {
  if (!webview) return
  error.value = false
  loading.value = true
  webview.reload()
}

function openExternal() {
  openInBrowser(CLASIFICACIONES_URL)
}

onMounted(() => {
  if (!host.value) return

  const el = document.createElement('webview') as unknown as WebviewElement
  // A dedicated partition isolates the guest from the launcher's own session
  // (no shared cookies/storage) while persisting whatever the ranking page
  // needs to render.
  el.setAttribute('partition', 'persist:minelatino-clasificaciones')
  el.src = CLASIFICACIONES_URL
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.border = 'none'
  el.style.display = 'inline-flex'

  el.addEventListener('did-start-loading', () => {
    loading.value = true
    error.value = false
  })
  el.addEventListener('did-stop-loading', () => { loading.value = false })
  el.addEventListener('dom-ready', () => {
    loading.value = false
    // Show only the ranking; re-applied on each load (see HIDE_CHROME_CSS).
    el.insertCSS(HIDE_CHROME_CSS).catch(() => {})
  })
  el.addEventListener('did-fail-load', (event) => {
    const e = event as Event & { errorCode: number, isMainFrame: boolean }
    // -3 (ERR_ABORTED) fires for benign sub-resource/redirect aborts; only a
    // main-frame failure is a real error worth the retry screen.
    if (e.isMainFrame && e.errorCode !== -3) {
      loading.value = false
      error.value = true
    }
  })

  host.value.appendChild(el)
  webview = el
})
</script>

<style scoped>
.ml-class {
  width: 100%;
  /* Fill the shell's routed middle column exactly. That column already accounts
     for the global system bar and the shell's own 56px top bar, so `100%`
     (resolved against its definite flex height) gives the embedded page a real
     height without a magic pixel offset — and the column never scrolls. */
  height: 100%;
  box-sizing: border-box;
}

.ml-class-title {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
}

.ml-class-subtitle {
  font-size: 0.8rem;
  color: var(--color-secondary-text);
}

.ml-class-frame {
  position: relative;
  min-height: 0;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background-color: color-mix(in srgb, rgb(var(--v-theme-surface)) 72%, transparent);
  box-shadow: 0 12px 30px -22px rgba(0, 0, 0, 0.8);
}

.ml-class-host {
  position: absolute;
  inset: 0;
}

.ml-class-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 24px;
  background-color: color-mix(in srgb, rgb(var(--v-theme-surface)) 82%, transparent);
}

.ml-class-overlay-text {
  font-size: 0.86rem;
  color: var(--color-secondary-text);
}
</style>
