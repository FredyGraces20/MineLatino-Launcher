<template>
  <img v-if="dataUrl" :src="dataUrl" :alt="alt" class="cosmetic-thumb">
  <img v-else-if="fallbackSrc" :src="fallbackSrc" :alt="alt" class="cosmetic-thumb" loading="lazy">
  <v-icon v-else size="52" class="cosmetic-thumb-icon">checkroom</v-icon>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { AmbientLight, DirectionalLight, Mesh, MeshStandardMaterial, NearestFilter, PerspectiveCamera, Scene, SRGBColorSpace, Texture, Vector3, WebGLRenderer } from 'three'
import { cosmeticGeometry, JavaCosmeticModel } from '@/util/cosmeticGeometry'
import { CosmeticProduct, resourceUrl } from '@/composables/cosmeticsStore'

const props = defineProps<{ product: CosmeticProduct; alt?: string }>()
const dataUrl = ref('')
const fallbackSrc = ref('')

onMounted(() => {
  if (!props.product.hasTexture) return
  if (!props.product.hasModel) { fallbackSrc.value = resourceUrl(props.product); return }
  // Lazy render: only build the 3D snapshot when the thumb scrolls into view.
  const io = new IntersectionObserver(entries => {
    if (!entries[0]?.isIntersecting) return
    io.disconnect()
    renderSnapshot().catch(() => { fallbackSrc.value = resourceUrl(props.product) })
  }, { rootMargin: '200px' })
  // Observe the nearest ancestor or a sentinel; we use the component root element.
  const el = document.querySelector(`[data-thumb-id="${props.product.id}"]`)
  if (el) io.observe(el)
  else renderSnapshot().catch(() => { fallbackSrc.value = resourceUrl(props.product) })
})

async function renderSnapshot() {
  const w = 160, h = 150
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true })
  if (!gl) throw new Error('No WebGL')
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: false })
  renderer.setSize(w, h, false)
  renderer.setPixelRatio(1)
  try {
    const [modelRes, texRes] = await Promise.all([
      fetch(resourceUrl(props.product, true), { credentials: 'omit' }),
      fetch(resourceUrl(props.product), { credentials: 'omit' }),
    ])
    if (!modelRes.ok || !texRes.ok) throw new Error('Fetch failed')
    const model: JavaCosmeticModel = JSON.parse(await modelRes.text())
    const blob = await texRes.blob()
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' })
    const scene = new Scene()
    const camera = new PerspectiveCamera(35, w / h, 0.1, 500)
    camera.position.set(0, 2, 28)
    camera.lookAt(0, 0, 0)
    scene.add(new AmbientLight(0xffffff, 0.7))
    const dir = new DirectionalLight(0xffffff, 0.9)
    dir.position.set(5, 10, 12)
    scene.add(dir)
    const texture = new Texture(bitmap)
    texture.minFilter = NearestFilter; texture.magFilter = NearestFilter
    ;(texture as Texture & { colorSpace: string }).colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    const geometry = cosmeticGeometry(model)
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ map: texture, alphaTest: 0.1, roughness: 1 }))
    // Rotate so the cosmetic front faces the camera (same as the preview).
    mesh.rotation.y = Math.PI
    scene.add(mesh)
    // Auto-fit: compute bounding box and adjust camera distance.
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    const size = box.getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const dist = maxDim / (2 * Math.tan((camera.fov / 2) * Math.PI / 180)) * 1.6
    camera.position.set(0, size.y * 0.15, dist)
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
    dataUrl.value = canvas.toDataURL('image/png')
    // Dispose GPU resources immediately.
    geometry.dispose(); texture.dispose(); (mesh.material as MeshStandardMaterial).dispose()
    bitmap.close()
  } finally {
    renderer.dispose()
  }
}
</script>
<style scoped>
.cosmetic-thumb { max-width: 85px; max-height: 90px; image-rendering: pixelated; object-fit: contain; }
.cosmetic-thumb-icon { color: var(--ml-dim, #b4b8c3); }
</style>
