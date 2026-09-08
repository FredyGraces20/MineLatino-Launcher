import { describe, expect, it } from 'vitest'
import { cosmeticGeometry } from './cosmeticGeometry'

describe('cosmetic Java model preview', () => {
  it('builds a face with default UVs in skin pixel units', () => {
    const geometry = cosmeticGeometry({ elements: [{ from: [0,0,0], to: [16,16,16], faces: { north: {} } }] })
    expect(geometry.getAttribute('position').count).toBe(6)
    expect(Array.from(geometry.getAttribute('position').array).slice(0,3)).toEqual([8,8,-8])
    expect(Array.from(geometry.getAttribute('uv').array).slice(0,2)).toEqual([0,1])
    geometry.dispose()
  })
  it('rejects invalid rotations, coordinates and empty models', () => {
    expect(() => cosmeticGeometry({ elements: [] })).toThrow()
    expect(() => cosmeticGeometry({ elements: [{ from: [NaN,0,0], to: [16,16,16], faces: { up: {} } }] })).toThrow()
    expect(() => cosmeticGeometry({ elements: [{ from: [0,0,0], to: [16,16,16], faces: { up: { rotation: 45 } } }] })).toThrow()
  })
  it('rotates face UVs and geometry like the mod', () => {
    const geometry = cosmeticGeometry({ elements: [{ from: [0,0,0], to: [16,16,16], rotation: { axis: 'y', angle: 90, origin: [8,8,8] }, faces: { north: { uv: [2,4,10,12], rotation: 90 } } }] })
    const p = geometry.getAttribute('position')
    expect(p.getX(0)).toBeCloseTo(-8); expect(p.getZ(0)).toBeCloseTo(-8)
    expect(Array.from(geometry.getAttribute('uv').array).slice(0,2)).toEqual([0.125,0.25])
    geometry.dispose()
  })
})
