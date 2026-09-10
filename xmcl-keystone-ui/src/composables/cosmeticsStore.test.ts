import { describe, expect, it } from 'vitest'
import { cosmeticSlots, parseProduct } from './cosmeticsStore'

const product = { id: 'cape', name: 'Capa', slot: 'CAPE', description: '', amountMinor: null, currency: 'USD', hasTexture: true, hasModel: false, textureCount: 1, resourceVersion: 'abcdef123456' }

describe('cosmetics without animated skins', () => {
  it('accepts every supported cosmetic from an older service', () => {
    for (const slot of Object.keys(cosmeticSlots)) {
      expect(parseProduct({ ...product, slot, hasAvatarPackage: false }).slot).toBe(slot)
    }
    expect(Object.keys(cosmeticSlots)).toHaveLength(5)
  })
  it('rejects legacy character products without rejecting normal capes', () => {
    expect(() => parseProduct({ ...product, slot: 'SKIN', hasAvatarPackage: true })).toThrow()
    expect(parseProduct(product).slot).toBe('CAPE')
  })
})
