import { readFile, outputJson } from 'fs-extra'
import { join } from 'path'
import {
  MineLatinoServiceKey,
  type MineLatinoConfig,
  type MineLatinoNewsEmbed,
  type MineLatinoNewsItem,
  type MineLatinoNewsResult,
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
}
