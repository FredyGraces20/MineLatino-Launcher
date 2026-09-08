<template>
  <section class="cosmetics-page visible-scroll">
    <header class="catalog-heading">
      <div><span class="eyebrow">MINELATINO · EXPRESA TU ESTILO</span><h1>Cosméticos</h1><p>Descubre tu próximo look. Pruébalo sobre tu skin antes de comprar.</p></div>
      <v-btn variant="tonal" :loading="loading" @click="refresh">Actualizar</v-btn>
    </header>
    <div class="catalog-toolbar">
      <v-text-field v-model="search" label="Buscar cosmético" prepend-inner-icon="search" hide-details clearable density="compact" />
      <v-select v-model="slot" :items="categories" label="Categoría" hide-details density="compact" />
    </div>
    <v-alert v-if="error" type="warning" variant="tonal" class="my-4">{{ error }} <v-btn variant="text" @click="refresh">Reintentar</v-btn></v-alert>
    <p v-if="loading" role="status">Cargando cosméticos publicados…</p>
    <p v-else-if="!filtered.length && !error" class="empty-state">{{ products.length ? 'No hay cosméticos para esta búsqueda.' : 'Todavía no hay cosméticos publicados. Vuelve pronto.' }}</p>
    <div class="catalog-layout">
      <div class="product-grid">
        <button v-for="product in filtered" :key="product.id" type="button" class="product-card" @click="open(product)">
          <div class="product-art"><img v-if="product.hasTexture" :src="resourceUrl(product)" :alt="`Textura de ${product.name}`" loading="lazy"><v-icon v-else size="52">checkroom</v-icon><span>PROBAR EN 3D ↗</span></div>
          <div class="product-copy"><small>{{ cosmeticSlots[product.slot] }}</small><h2>{{ product.name }}</h2><strong>{{ priceLabel(product) }}</strong></div>
        </button>
      </div>
      <aside v-if="featured" class="fitting-room">
        <span class="eyebrow">TU PROBADOR</span>
        <CosmeticPreview v-if="!dialog" :key="featured.id" :product="featured" :skin="skin" />
        <h2>{{ featured.name }}</h2><p>{{ playerName }} · {{ cosmeticSlots[featured.slot] }}</p>
        <v-btn block color="primary" @click="open(featured)">Ver producto</v-btn>
      </aside>
    </div>
    <v-dialog v-model="dialog" max-width="900" scrollable>
      <v-card v-if="selected" class="product-dialog">
        <v-card-title class="dialog-heading"><span>{{ selected.name }}</span><v-btn icon="close" variant="text" aria-label="Cerrar vista previa" @click="dialog = false" /></v-card-title>
        <v-card-text>
          <div class="detail-grid">
            <div><CosmeticPreview v-if="dialog" :key="selected.id" :product="selected" :skin="skin" /><p class="preview-hint">Arrastra para girar · Rueda para acercar<br>Vista orientativa; requiere el mod para verse en el juego.</p></div>
            <div class="product-details">
              <span class="eyebrow">{{ cosmeticSlots[selected.slot] }} · COSMÉTICO DIGITAL</span>
              <h2>{{ selected.name }}</h2>
              <p class="description">{{ selected.description || 'Este cosmético todavía no tiene una descripción.' }}</p>
              <div class="price">{{ priceLabel(selected) }}</div>
              <div class="recipient"><small>Cuenta seleccionada</small><strong>{{ playerName }}</strong><span>{{ gameProfile?.id || 'Inicia sesión con tu cuenta de Minecraft' }}</span></div>
              <p class="preview-hint">La compra se vinculará al UUID premium verificado de tu cuenta, aunque cambies de nick. No se entrega a un nombre escrito sin verificar.</p>
              <v-btn block color="primary" :disabled="selected.amountMinor === null || !gameProfile?.id" @click="checkout = true">Comprar · {{ selected.amountMinor === null ? 'Sin precio' : priceLabel(selected) }}</v-btn>
              <span class="payment-note">Pagos próximamente · No se realizará ningún cargo</span>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
    <v-dialog v-model="checkout" max-width="470">
      <v-card title="Finalizar compra">
        <v-card-text><p>{{ selected?.name }} · {{ playerName }}</p><p class="my-4">La tienda está en preparación. Todavía no hay proveedores de pago conectados.</p>
          <v-btn v-for="provider in ['PayPal', 'Binance Pay', 'Mercado Pago']" :key="provider" disabled block class="mb-2">{{ provider }} · Próximamente</v-btn>
          <p class="preview-hint">Tu cosmético solo se entregará cuando el servidor confirme el pago. No se ha creado ninguna compra.</p>
        </v-card-text>
        <v-card-actions><v-btn @click="checkout = false">Volver al producto</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import steveSkin from '@/assets/steve_skin.png'
import { kUserContext } from '@/composables/user'
import { injection } from '@/util/inject'
import { CosmeticProduct, cosmeticSlots, priceLabel, resourceUrl, useCosmeticsStore } from '@/composables/cosmeticsStore'
import CosmeticPreview from './CosmeticPreview.vue'

const { gameProfile } = injection(kUserContext)
const skin = computed(() => gameProfile.value?.textures?.SKIN?.url || steveSkin)
const playerName = computed(() => gameProfile.value?.name || 'Skin de ejemplo · Steve')
const { products, loading, error, refresh } = useCosmeticsStore()
const search = ref(''), slot = ref('ALL'), selected = ref<CosmeticProduct>(), dialog = ref(false), checkout = ref(false)
const categories = [{ title: 'Todos', value: 'ALL' }, ...Object.entries(cosmeticSlots).map(([value, title]) => ({ title, value }))]
const filtered = computed(() => products.value.filter(p => (slot.value === 'ALL' || slot.value === p.slot) && `${p.name} ${p.description}`.toLocaleLowerCase().includes((search.value || '').toLocaleLowerCase())))
const featured = computed(() => filtered.value[0])
function open(product: CosmeticProduct) { selected.value = product; dialog.value = true; checkout.value = false }
watch(() => gameProfile.value?.id, () => { checkout.value = false })
watch(dialog, value => { if (!value) checkout.value = false })
onMounted(refresh)
</script>
<style scoped>
.cosmetics-page { height: 100%; overflow-y: auto; padding: 28px; color: var(--ml-text); }
.catalog-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.eyebrow { color: var(--ml-accent-text, #edba62); font-size: 10px; font-weight: 700; letter-spacing: .16em; }
h1 { font-size: 32px; letter-spacing: -.04em; margin: 6px 0; } h2 { font-size: 18px; margin: 6px 0 10px; }
p { color: var(--ml-dim, #b4b8c3); font-size: 13px; line-height: 1.6; }
.catalog-toolbar { display: grid; grid-template-columns: minmax(160px, 1fr) 190px; gap: 12px; margin-bottom: 24px; }
.catalog-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 22px; align-items: start; }
.product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
.product-card { text-align: left; overflow: hidden; border: 1px solid var(--ml-border, #ffffff18); border-radius: 18px; background: var(--ml-panel, #171a21); transition: transform 280ms, border-color 280ms; }
.product-card:hover { transform: translateY(-3px); border-color: var(--ml-accent); }
.product-card:focus-visible { outline: 2px solid var(--ml-accent); outline-offset: 3px; }
.product-art { height: 145px; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse, #c9963a15, transparent); position: relative; }
.product-art img { max-width: 85px; max-height: 90px; image-rendering: pixelated; object-fit: contain; }
.product-art span { position: absolute; bottom: 7px; font-size: 9px; letter-spacing: .12em; color: var(--ml-dim); }
.product-copy { padding: 16px; } .product-copy small { color: var(--ml-dim); } .product-copy strong { color: var(--ml-accent-text); font-size: 14px; }
.fitting-room { border: 1px solid var(--ml-border); padding: 16px; border-radius: 20px; background: var(--ml-panel); }
.fitting-room .eyebrow { display: block; margin-bottom: 12px; }
.fitting-room p { margin-bottom: 16px; }
.product-dialog { background: #171a21 !important; border: 1px solid #ffffff20; border-radius: 22px !important; }
.dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; white-space: normal; }
.detail-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 24px; }
.product-details { display: flex; flex-direction: column; gap: 12px; }
.description { white-space: pre-wrap; overflow-wrap: anywhere; }
.price { font-size: 28px; font-weight: 700; color: #edba62; }
.recipient { display: flex; flex-direction: column; padding: 12px; background: #ffffff06; border: 1px solid #ffffff14; border-radius: 12px; gap: 4px; }
.recipient span { font-size: 10px; overflow-wrap: anywhere; color: #9ca3b4; }
.preview-hint, .payment-note { font-size: 11px; color: #a5acbb; margin-top: 8px; }
.empty-state { padding: 36px; text-align: center; border: 1px dashed var(--ml-border); border-radius: 16px; }
@media (max-width: 1050px) { .catalog-layout { grid-template-columns: 1fr; } .fitting-room { display: none; } }
@media (max-width: 850px) { .cosmetics-page { padding: 16px; } .detail-grid { grid-template-columns: 1fr; } .catalog-heading { align-items: start; } }
@media (prefers-reduced-motion: reduce) { .product-card { transition: none; } }
</style>
