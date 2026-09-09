import { readFile, outputJson, readdir, remove } from 'fs-extra'
import { join } from 'path'
import {
  MineLatinoServiceKey,
  MarketType,
  type MineLatinoAutoMod,
  type MineLatinoAutoModVersion,
  type MineLatinoConfig,
  type MineLatinoNewsEmbed,
  type MineLatinoNewsItem,
  type MineLatinoNewsResult,
  type MineLatinoPlaytimeLeaderboardEntry,
  type MineLatinoPreset,
  type MineLatinoService as IMineLatinoService,
  type MineLatinoStoreCategory,
  type MineLatinoStoreProduct,
  type MineLatinoStoreProductsResult,
  type MineLatinoStoreResult,
  type MineLatinoUpdateItem,
  type MineLatinoUpdatesResult,
  type MineLatinoWebWindowInfo,
  type MineLatinoWebWindowOptions,
} from '@xmcl/runtime-api'
import { Inject, LauncherAppKey, type LauncherApp } from '@xmcl/runtime/app'
import { AbstractService, ExposeServiceKey } from '@xmcl/runtime/service'
import { LaunchService } from '~/launch'
import { InstanceModsService, InstanceService } from '~/instance'
import { InstanceInstallService } from '~/instanceIO'
import { VersionMetadataService } from '@xmcl/runtime/install'
import { FALLBACK_CONFIG, normalizeConfig, resolveBackendUrl } from './config'
import { MineLatinoWebWindows } from './webWindow'

/**
 * Feeds the MineLatino home screen.
 *
 * Everything runs in the main process, so browser CORS does not apply and the
 * Discord bot token never reaches the client — it stays in the backend. The
 * pattern is stale-while-revalidate: the copy cached on disk is returned
 * immediately, a refresh happens in the background, and the result is pushed to
 * the renderer through a service event. With no backend and no cache the bundled
 * `FALLBACK_CONFIG` keeps the screen usable, so a first launch offline shows
 * content instead of an error.
 */

/** How long a background refresh is skipped for, per feed. */
const NEWS_TTL_MS = 60_000
const UPDATES_TTL_MS = 60_000
const CONFIG_TTL_MS = 5 * 60_000
/** The catalog changes rarely, so its categories and per-mode products last longer. */
const STORE_TTL_MS = 5 * 60_000
const STORE_PRODUCTS_TTL_MS = 5 * 60_000
/** Periodic refresh while the launcher stays open. */
const REFRESH_INTERVAL_MS = 5 * 60_000
const REQUEST_TIMEOUT_MS = 15_000

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * Guards the renderer against a backend that is older than the launcher: an
 * item missing `images` or `embeds` would throw while rendering the feed.
 */
function normalizeNewsItem(raw: unknown): MineLatinoNewsItem | undefined {
  const source = asObject(raw)
  const id = asString(source.id)
  if (!id) return undefined
  const embeds = Array.isArray(source.embeds)
    ? source.embeds.map((raw): MineLatinoNewsEmbed => {
        const embed = asObject(raw)
        return {
          title: asString(embed.title) || undefined,
          description: asString(embed.description) || undefined,
          url: asString(embed.url) || undefined,
          color: typeof embed.color === 'number' ? embed.color : undefined,
          image: asString(embed.image) || undefined,
          thumbnail: asString(embed.thumbnail) || undefined,
          fields: Array.isArray(embed.fields)
            ? embed.fields.map((raw) => {
                const field = asObject(raw)
                return {
                  name: asString(field.name),
                  value: asString(field.value),
                  inline: field.inline === true,
                }
              })
            : [],
        }
      })
    : []
  return {
    id,
    author: asString(source.author),
    authorAvatar: asString(source.authorAvatar),
    timestamp: asString(source.timestamp),
    content: asString(source.content),
    images: asStringArray(source.images),
    embeds,
    url: asString(source.url),
    isAnnouncement: source.isAnnouncement === true,
  }
}

function normalizeUpdateItem(raw: unknown): MineLatinoUpdateItem | undefined {
  const source = asObject(raw)
  const id = asString(source.id)
  const link = asString(source.link)
  if (!id && !link) return undefined
  return {
    id: id || link,
    title: asString(source.title),
    date: asString(source.date),
    link,
    excerpt: asString(source.excerpt),
    image: asString(source.image) || undefined,
  }
}

function normalizeStoreCategory(raw: unknown): MineLatinoStoreCategory | undefined {
  const source = asObject(raw)
  const id = asNumber(source.id, Number.NaN)
  const name = asString(source.name)
  if (!Number.isFinite(id) || !name) return undefined
  return {
    id,
    name,
    slug: asString(source.slug),
    count: asNumber(source.count, 0),
    image: asString(source.image) || undefined,
  }
}

function normalizeStoreProduct(raw: unknown): MineLatinoStoreProduct | undefined {
  const source = asObject(raw)
  const id = asNumber(source.id, Number.NaN)
  const permalink = asString(source.permalink)
  if (!Number.isFinite(id) || !permalink) return undefined
  return {
    id,
    name: asString(source.name),
    slug: asString(source.slug),
    permalink,
    shortDescription: asString(source.shortDescription),
    image: asString(source.image) || undefined,
    priceText: asString(source.priceText),
    regularPriceText: asString(source.regularPriceText) || undefined,
    onSale: source.onSale === true,
    inStock: source.inStock !== false,
  }
}

@ExposeServiceKey(MineLatinoServiceKey)
export class MineLatinoService extends AbstractService implements IMineLatinoService {
  readonly #backendUrl = resolveBackendUrl()
  #config: MineLatinoConfig = FALLBACK_CONFIG
  #news: MineLatinoNewsResult = { items: [], fetchedAt: 0, stale: true, source: 'discord' }
  #updates: MineLatinoUpdatesResult = { items: [], fetchedAt: 0, stale: true, provider: 'none' }
  #store: MineLatinoStoreResult = { categories: [], fetchedAt: 0, stale: true }
  /** Per-category product pages, cached in memory (not persisted) on demand. */
  #storeProducts = new Map<number, MineLatinoStoreProductsResult>()
  #configFetchedAt = 0
  #refreshing: Promise<void> | undefined
  #timer: NodeJS.Timeout | undefined
  #windows: MineLatinoWebWindows

  constructor(@Inject(LauncherAppKey) app: LauncherApp) {
    super(app, async () => {
      await this.#restore()
      if (!this.#backendUrl) {
        this.warn('No MineLatino backend URL configured; running on the bundled fallback config. Set MINELATINO_BACKEND_URL or DEFAULT_BACKEND_URL in main/minelatino/config.ts.')
      }
      // Do not block boot on the network: the screen already has cached content.
      void this.#refresh()
      this.#timer = setInterval(() => { void this.#refresh() }, REFRESH_INTERVAL_MS)

      // Auto-report playtime after each Minecraft session ends.
      const launchService = await this.app.registry.get(LaunchService)
      const instanceService = await this.app.registry.get(InstanceService)
      launchService.on('minecraft-exit', (options) => {
        if (!options.gameDirectory || !options.duration) return
        const user = options.user
        if (!user?.selectedProfile || !user.profiles) return
        const profile = user.profiles[user.selectedProfile]
        const name = profile?.name || user.username
        if (!name) return
        const instance = instanceService.state.all[options.gameDirectory]
        const playtime = instance ? instance.playtime : 0
        void this.reportPlaytime(name, playtime)
      })
    })
    this.#windows = new MineLatinoWebWindows(
      message => this.log(message),
      windows => this.emit('webWindows', windows),
      url => this.app.shell.openInBrowser(url),
    )
    // Neither the refresh interval nor a third-party store window may outlive
    // the launcher. `registryDisposer` is the hook the other long-lived
    // services use for exactly this (see `pluginNetworkInterface`).
    this.app.registryDisposer(() => {
      if (this.#timer) clearInterval(this.#timer)
      this.#timer = undefined
      this.#windows.closeAll()
    })
  }

  #cachePath(name: string) {
    return join(this.app.appDataPath, 'minelatino', name)
  }

  async #restore() {
    const [cachedConfig, cachedNews, cachedUpdates, cachedStore] = await Promise.all([
      this.#readJson<{ fetchedAt: number, config: unknown }>('config.json'),
      this.#readJson<unknown>('news.json'),
      this.#readJson<unknown>('updates.json'),
      this.#readJson<unknown>('store.json'),
    ])

    if (cachedConfig) {
      this.#config = normalizeConfig(cachedConfig.config)
      this.#configFetchedAt = asNumber(cachedConfig.fetchedAt, 0)
    }

    const news = asObject(cachedNews)
    const newsItems = Array.isArray(news.items)
      ? news.items.map(normalizeNewsItem).filter((item): item is MineLatinoNewsItem => !!item)
      : undefined
    if (newsItems) {
      this.#news = {
        items: newsItems,
        fetchedAt: asNumber(news.fetchedAt, 0),
        // Anything restored from disk is by definition not fresh.
        stale: true,
        source: 'discord',
      }
    }

    const updates = asObject(cachedUpdates)
    const updateItems = Array.isArray(updates.items)
      ? updates.items.map(normalizeUpdateItem).filter((item): item is MineLatinoUpdateItem => !!item)
      : undefined
    if (updateItems) {
      this.#updates = {
        items: updateItems,
        fetchedAt: asNumber(updates.fetchedAt, 0),
        stale: true,
        provider: this.#config.updates.provider,
      }
    }

    const store = asObject(cachedStore)
    const categories = Array.isArray(store.categories)
      ? store.categories.map(normalizeStoreCategory).filter((c): c is MineLatinoStoreCategory => !!c)
      : undefined
    if (categories) {
      this.#store = {
        categories,
        fetchedAt: asNumber(store.fetchedAt, 0),
        stale: true,
      }
    }

    this.log(`Restored MineLatino cache: ${this.#news.items.length} news, ${this.#updates.items.length} updates, ${this.#store.categories.length} store categories`)
  }

  async #readJson<T>(name: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(this.#cachePath(name), 'utf-8')) as T
    }
    catch {
      // A missing or truncated cache is normal on first run.
      return undefined
    }
  }

  async #writeJson(name: string, data: unknown) {
    try {
      await outputJson(this.#cachePath(name), data, { spaces: 2 })
    }
    catch (error) {
      this.warn(`Failed to persist minelatino/${name}: ${(error as Error).message}`)
    }
  }

  async #request(path: string): Promise<{ ok: boolean, body: unknown }> {
    const response = await this.app.fetch(`${this.#backendUrl}${path}`, {
      headers: { 'User-Agent': this.app.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    // A 503 from our own backend still carries a usable stale payload, so the
    // body is read before the status is judged.
    const body = await response.json().catch(() => undefined)
    return { ok: response.ok, body }
  }

  /** Concurrent callers share one in-flight refresh. */
  #refresh(): Promise<void> {
    if (!this.#backendUrl) return Promise.resolve()
    if (!this.#refreshing) {
      this.#refreshing = Promise.all([
        this.#fetchConfig(),
        this.#fetchNews(),
        this.#fetchUpdates(),
        this.#fetchStore(),
      ]).then(() => {}, () => {}).finally(() => { this.#refreshing = undefined })
    }
    return this.#refreshing
  }

  async #fetchConfig() {
    try {
      const { ok, body } = await this.#request('/api/config')
      if (!ok) throw new Error(`GET /api/config responded ${body ? 'with an error' : 'without a body'}`)
      this.#config = normalizeConfig(body)
      this.#configFetchedAt = Date.now()
      await this.#writeJson('config.json', { fetchedAt: this.#configFetchedAt, config: this.#config })
      this.emit('config', this.#config)
      // After a config refresh, ensure autoMods are installed in matching
      // instances. Fire-and-forget: the sync runs in the background and logs
      // its own failures.
      void this.#ensureDefaultInstanceThenSync()
    }
    catch (error) {
      // The cached (or bundled) config stays in place; no event, no throw.
      this.warn(`MineLatino config refresh failed: ${(error as Error).message}`)
    }
  }

  async #fetchNews() {
    if (!this.#config.news.enabled) return
    try {
      const { ok, body } = await this.#request('/api/news')
      const source = asObject(body)
      const items = Array.isArray(source.items)
        ? source.items.map(normalizeNewsItem).filter((item): item is MineLatinoNewsItem => !!item)
        : undefined
      if (!items) throw new Error(asString(source.error) || 'GET /api/news returned no items')
      this.#news = {
        items,
        fetchedAt: asNumber(source.fetchedAt, Date.now()),
        stale: !ok || source.stale === true,
        source: 'discord',
        error: asString(source.error) || undefined,
      }
      await this.#writeJson('news.json', this.#news)
      this.emit('news', this.#news)
    }
    catch (error) {
      this.#news = { ...this.#news, stale: true, error: (error as Error).message }
      this.emit('news', this.#news)
      this.warn(`MineLatino news refresh failed: ${(error as Error).message}`)
    }
  }

  async #fetchUpdates() {
    if (!this.#config.updates.enabled) return
    try {
      const { ok, body } = await this.#request('/api/updates')
      const source = asObject(body)
      const items = Array.isArray(source.items)
        ? source.items.map(normalizeUpdateItem).filter((item): item is MineLatinoUpdateItem => !!item)
        : undefined
      if (!items) throw new Error(asString(source.error) || 'GET /api/updates returned no items')
      this.#updates = {
        items,
        fetchedAt: asNumber(source.fetchedAt, Date.now()),
        stale: !ok || source.stale === true,
        provider: this.#config.updates.provider,
        error: asString(source.error) || undefined,
      }
      await this.#writeJson('updates.json', this.#updates)
      this.emit('updates', this.#updates)
    }
    catch (error) {
      this.#updates = { ...this.#updates, stale: true, error: (error as Error).message }
      this.emit('updates', this.#updates)
      this.warn(`MineLatino updates refresh failed: ${(error as Error).message}`)
    }
  }

  async #fetchStore() {
    try {
      const { ok, body } = await this.#request('/api/store')
      const source = asObject(body)
      // An empty list is valid (catalog disabled or no categories yet); only a
      // non-array means the backend did not answer with a catalog at all.
      const categories = Array.isArray(source.categories)
        ? source.categories.map(normalizeStoreCategory).filter((c): c is MineLatinoStoreCategory => !!c)
        : undefined
      if (!categories) throw new Error(asString(source.error) || 'GET /api/store returned no categories')
      this.#store = {
        categories,
        fetchedAt: asNumber(source.fetchedAt, Date.now()),
        stale: !ok || source.stale === true,
        error: asString(source.error) || undefined,
      }
      await this.#writeJson('store.json', this.#store)
      this.emit('store', this.#store)
    }
    catch (error) {
      this.#store = { ...this.#store, stale: true, error: (error as Error).message }
      this.emit('store', this.#store)
      this.warn(`MineLatino store refresh failed: ${(error as Error).message}`)
    }
  }

  #isStale(fetchedAt: number, ttl: number) {
    return Date.now() - fetchedAt > ttl
  }

  async getConfig(force?: boolean): Promise<MineLatinoConfig> {
    await this.initialize()
    if (force) await this.#fetchConfig()
    else if (this.#isStale(this.#configFetchedAt, CONFIG_TTL_MS)) void this.#refresh()
    return this.#config
  }

  async getNews(force?: boolean): Promise<MineLatinoNewsResult> {
    await this.initialize()
    if (force) await this.#fetchNews()
    else if (this.#isStale(this.#news.fetchedAt, NEWS_TTL_MS)) void this.#refresh()
    return this.#news
  }

  async getUpdates(force?: boolean): Promise<MineLatinoUpdatesResult> {
    await this.initialize()
    if (force) await this.#fetchUpdates()
    else if (this.#isStale(this.#updates.fetchedAt, UPDATES_TTL_MS)) void this.#refresh()
    return this.#updates
  }

  async getStore(force?: boolean): Promise<MineLatinoStoreResult> {
    await this.initialize()
    if (force) await this.#fetchStore()
    else if (this.#isStale(this.#store.fetchedAt, STORE_TTL_MS)) void this.#fetchStore()
    return this.#store
  }

  async getStoreProducts(category: number, force?: boolean): Promise<MineLatinoStoreProductsResult> {
    await this.initialize()
    const cached = this.#storeProducts.get(category)
    if (!force && cached && !this.#isStale(cached.fetchedAt, STORE_PRODUCTS_TTL_MS)) return cached
    try {
      const { ok, body } = await this.#request(`/api/store/products?category=${category}`)
      const source = asObject(body)
      const items = Array.isArray(source.items)
        ? source.items.map(normalizeStoreProduct).filter((p): p is MineLatinoStoreProduct => !!p)
        : []
      const result: MineLatinoStoreProductsResult = {
        category,
        items,
        total: asNumber(source.total, items.length),
        fetchedAt: asNumber(source.fetchedAt, Date.now()),
        stale: !ok || source.stale === true,
        error: asString(source.error) || undefined,
      }
      this.#storeProducts.set(category, result)
      return result
    }
    catch (error) {
      // Serve the last good copy for this mode; only a first-time failure is empty.
      if (cached) {
        const stale: MineLatinoStoreProductsResult = { ...cached, stale: true, error: (error as Error).message }
        this.#storeProducts.set(category, stale)
        return stale
      }
      this.warn(`MineLatino store products refresh failed: ${(error as Error).message}`)
      return { category, items: [], total: 0, fetchedAt: 0, stale: true, error: (error as Error).message }
    }
  }

  async getBackendUrl(): Promise<string> {
    return this.#backendUrl
  }

  async openWebWindow(options: MineLatinoWebWindowOptions): Promise<void> {
    await this.initialize()
    // Never let a config value open a privileged scheme in a launcher window.
    if (!/^https?:\/\//i.test(options.url)) {
      this.warn(`Refusing to open a non-http url in a web window: ${options.url}`)
      return
    }
    if (options.externalBrowser) {
      await this.app.shell.openInBrowser(options.url)
      return
    }
    this.#windows.open({
      id: options.id,
      title: options.title || this.#config.branding.name,
      url: options.url,
      injectCss: options.injectCss,
    })
  }

  async closeWebWindow(id: string): Promise<void> {
    await this.initialize()
    this.#windows.close(id)
  }

  async getWebWindows(): Promise<MineLatinoWebWindowInfo[]> {
    await this.initialize()
    return this.#windows.list()
  }

  async reportPlaytime(name: string, playtime: number): Promise<void> {
    if (!this.#backendUrl) return
    try {
      await this.app.fetch(`${this.#backendUrl}/api/playtime/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.app.userAgent,
        },
        body: JSON.stringify({ name, playtime }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (err) {
      this.warn(`MineLatino playtime report failed: ${(err as Error).message}`)
    }
  }

  async getPlaytimeLeaderboard(): Promise<MineLatinoPlaytimeLeaderboardEntry[]> {
    if (!this.#backendUrl) return []
    try {
      const { ok, body } = await this.#request('/api/playtime/leaderboard')
      if (!ok) return []
      const source = asObject(body)
      const items = Array.isArray(source.items) ? source.items : []
      return items
        .map((raw): MineLatinoPlaytimeLeaderboardEntry | undefined => {
          const entry = asObject(raw)
          const rank = asNumber(entry.rank, 0)
          const name = asString(entry.name)
          if (!rank || !name) return undefined
          return {
            rank,
            name,
            playtime: asNumber(entry.playtime, 0),
            updatedAt: asString(entry.updatedAt),
          }
        })
        .filter((e): e is MineLatinoPlaytimeLeaderboardEntry => !!e)
    } catch (err) {
      this.warn(`MineLatino leaderboard fetch failed: ${(err as Error).message}`)
      return []
    }
  }

  /**
   * Determine which loader an instance uses, matching the autoMod vocabulary.
   * Returns undefined for vanilla or unknown loaders.
   */
  #instanceLoader(runtime: Record<string, unknown>): MineLatinoAutoModVersion['loader'] | undefined {
    if (runtime.fabricLoader || runtime.quiltLoader) return 'fabric'
    if (runtime.neoForged) return 'neoforge'
    if (runtime.forge) return 'forge'
    return undefined
  }

  /**
   * Read the JAR filenames already present in an instance's mods/ directory.
   * Returns an empty set when the directory does not exist or is unreadable.
   */
  async #instanceModFiles(instancePath: string): Promise<Set<string>> {
    try {
      const entries = await readdir(join(instancePath, 'mods'))
      return new Set(entries.filter(e => e.endsWith('.jar')).map(e => e.toLowerCase()))
    } catch {
      return new Set()
    }
  }

  /**
   * Find the best matching autoMod version for an instance's MC version and
   * loader. Prefers the newest modVersion when multiple entries match.
   */
  #findMatchingVersion(
    mod: MineLatinoAutoMod,
    minecraft: string,
    loader: MineLatinoAutoModVersion['loader'],
  ): MineLatinoAutoModVersion | undefined {
    const matches = mod.versions.filter(
      v => v.loader === loader && v.minecraftVersions.includes(minecraft),
    )
    // Return the last entry (assumed newest) when multiple match.
    return matches.length > 0 ? matches[matches.length - 1] : undefined
  }

  /** Resolve and install the Modrinth starter set declared by a preset. */
  async #installPresetMods(preset: MineLatinoPreset, instancePath: string) {
    if (preset.mods.length === 0) return

    const resolved = await Promise.all(preset.mods.map(async (mod) => {
      try {
        const params = new URLSearchParams({
          game_versions: JSON.stringify([preset.minecraftVersion]),
          loaders: JSON.stringify([preset.loader]),
        })
        const response = await this.app.fetch(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(mod.projectId)}/version?${params}`,
          {
            headers: { 'User-Agent': this.app.userAgent, Accept: 'application/json' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        )
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = await response.json()
        const versions = Array.isArray(body)
          ? body.map(asObject).filter(version => asString(version.id))
          : []
        const selected = mod.version
          ? versions.find(version => asString(version.id) === mod.version || asString(version.version_number) === mod.version)
          : versions.find(version => version.featured === true && asString(version.version_type) === 'release')
            ?? versions.find(version => asString(version.version_type) === 'release')
            ?? versions[0]
        const versionId = asString(selected?.id)
        if (!versionId) throw new Error('no compatible release')
        return { projectId: mod.projectId, versionId }
      } catch (error) {
        this.warn(`[autoInstance] Could not resolve starter mod ${mod.projectId}: ${(error as Error).message}`)
        return undefined
      }
    }))

    const versions = resolved.filter((entry): entry is { projectId: string, versionId: string } => !!entry)
    if (versions.length === 0) {
      this.warn('[autoInstance] No starter mods could be resolved; the profile remains usable.')
      return
    }

    try {
      const modsService = await this.app.registry.get(InstanceModsService)
      await modsService.installFromMarket({
        market: MarketType.Modrinth,
        version: versions.map(({ versionId }) => ({ versionId })),
        instancePath,
      })
      this.log(`[autoInstance] Installed ${versions.length}/${preset.mods.length} starter mods into ${instancePath}`)
    } catch (error) {
      // The instance and the cosmetics auto-mod are still useful if Modrinth is
      // temporarily unavailable. The catalog lets the player retry later.
      this.warn(`[autoInstance] Failed to install starter mods: ${(error as Error).message}`)
    }
  }

  /**
   * On a fresh install (zero managed instances), auto-create the recommended
   * preset so new users can press Play immediately. Then sync autoMods.
   */
  async #ensureDefaultInstanceThenSync() {
    try {
      const instanceService = await this.app.registry.get(InstanceService)
      const instances = instanceService.state.all
      // A fresh MineLatino installation can still discover external profiles
      // from another launcher. Those must not prevent creation of our managed
      // ready-to-play profile; only an existing managed profile means the user
      // has already configured this launcher.
      const hasManagedInstance = Object.values(instances)
        .some(instance => instanceService.isUnderManaged(instance.path))
      if (hasManagedInstance) {
        void this.syncAutoMods()
        return
      }
      const preset = this.#config.presets.find(p => p.recommended) ?? this.#config.presets[0]
      if (!preset) {
        this.warn('[autoInstance] No presets configured; skipping auto-creation.')
        return
      }
      this.log(`[autoInstance] Fresh install detected — creating default profile "${preset.name}" (${preset.minecraftVersion} ${preset.loader})`)
      const runtime = { minecraft: preset.minecraftVersion } as { minecraft: string, fabricLoader?: string }
      if (preset.loader === 'fabric') {
        const metadata = await this.app.registry.get(VersionMetadataService)
        const fabricVersions = await metadata.getFabricVersions()
        if (!fabricVersions.gameVersions.includes(preset.minecraftVersion)) {
          this.warn(`[autoInstance] Fabric does not support Minecraft ${preset.minecraftVersion}; skipping.`)
          return
        }
        const loaderVersion = fabricVersions.loaderVersions[0]?.version
        if (!loaderVersion) {
          this.warn('[autoInstance] No Fabric loader version available; skipping.')
          return
        }
        runtime.fabricLoader = loaderVersion
      }
      const path = await instanceService.createInstance({
        name: preset.name,
        description: preset.description ?? '',
        runtime,
        resourcepacks: true,
        shaderpacks: true,
      })
      this.log(`[autoInstance] Created instance at ${path}`)
      await this.#installPresetMods(preset, path)
      await this.syncAutoMods()
    } catch (error) {
      this.warn(`[autoInstance] Failed to auto-create default instance: ${(error as Error).message}`)
      void this.syncAutoMods()
    }
  }

  /**
   * Ensure every matching instance has the latest autoMods installed.
   *
   * Runs after each config refresh so a backend operator can push a new mod
   * version and every player's launcher picks it up within minutes. Also called
   * right after instance creation so a brand-new profile gets the mod
   * immediately instead of waiting for the next refresh cycle.
   *
   * The check is fast when nothing is missing: it only reads the mods/
   * directory listing and compares file names. Downloads happen only when a JAR
   * is absent or an older version is detected. Before installing the new JAR,
   * older versions of the same mod are removed from the mods/ directory.
   */
  async syncAutoMods(): Promise<void> {
    const autoMods = this.#config.autoMods
    if (!autoMods || autoMods.length === 0) return

    const instanceService = await this.app.registry.get(InstanceService)
    const installService = await this.app.registry.get(InstanceInstallService)
    const instances = instanceService.state.all

    for (const [instancePath, instance] of Object.entries(instances)) {
      const runtime = (instance as Record<string, unknown>).runtime as Record<string, unknown> | undefined
      if (!runtime) continue
      const minecraft = asString(runtime.minecraft)
      const loader = this.#instanceLoader(runtime)
      if (!minecraft || !loader) continue

      const existingMods = await this.#instanceModFiles(instancePath)

      for (const mod of autoMods) {
        const match = this.#findMatchingVersion(mod, minecraft, loader)
        if (!match) continue

        // Already installed with the expected file name — skip.
        if (existingMods.has(match.fileName.toLowerCase())) continue

        // Remove older JARs of the same mod before installing the new one.
        const prefix = `${mod.id}-${loader}-${minecraft}-`
        for (const file of existingMods) {
          if (file !== match.fileName.toLowerCase() && file.startsWith(prefix) && file.endsWith('.jar')) {
            try {
              const oldPath = join(instancePath, 'mods', file)
              await remove(oldPath)
              this.log(`[autoMods] Removed old ${file} from ${instance.name || instancePath}`)
            } catch (err) {
              this.warn(`[autoMods] Failed to remove old ${file}: ${(err as Error).message}`)
            }
          }
        }

        // Build an InstanceFile for the download pipeline.
        const instanceFile = {
          path: `mods/${match.fileName}`,
          hashes: { sha1: match.sha1 },
          downloads: [match.downloadUrl],
          size: match.fileSize || undefined,
        }

        try {
          this.log(`[autoMods] Installing ${mod.name} ${match.modVersion} into ${instance.name || instancePath}`)
          await installService.installInstanceFiles({
            path: instancePath,
            oldFiles: [],
            files: [instanceFile],
          })
        } catch (err) {
          this.warn(`[autoMods] Failed to install ${mod.name} into ${instance.name || instancePath}: ${(err as Error).message}`)
        }
      }
    }
  }
}
