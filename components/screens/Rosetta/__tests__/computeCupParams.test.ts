import { computeCupParams } from '../index'

describe('computeCupParams', () => {
  it('returns center at (0.5, 0.5)', () => {
    const p = computeCupParams(800, 1200)
    expect(p.center).toEqual([0.5, 0.5])
  })

  it('produces a true on-screen circle: radiusUV.x * width === radiusUV.y * height', () => {
    const p = computeCupParams(800, 1200)
    const onScreenRadiusX = p.radiusUV[0] * 800
    const onScreenRadiusY = p.radiusUV[1] * 1200
    expect(onScreenRadiusX).toBeCloseTo(onScreenRadiusY, 6)
  })

  it('uses 42.5% of the smaller dimension as the cup radius', () => {
    const p = computeCupParams(800, 1200)
    const expectedRadiusPx = 0.5 * 0.85 * 800
    expect(p.radiusUV[0] * 800).toBeCloseTo(expectedRadiusPx, 6)
    expect(p.radiusUV[1] * 1200).toBeCloseTo(expectedRadiusPx, 6)
  })

  it('handles landscape orientation (width > height)', () => {
    const p = computeCupParams(1200, 800)
    const expectedRadiusPx = 0.5 * 0.85 * 800
    expect(p.radiusUV[0] * 1200).toBeCloseTo(expectedRadiusPx, 6)
    expect(p.radiusUV[1] * 800).toBeCloseTo(expectedRadiusPx, 6)
  })

  it('handles square viewport', () => {
    const p = computeCupParams(1000, 1000)
    expect(p.radiusUV[0]).toBeCloseTo(p.radiusUV[1], 6)
    expect(p.radiusUV[0]).toBeCloseTo(0.425, 6)
  })

  it('returns rim thickness fraction of 0.04', () => {
    const p = computeCupParams(800, 1200)
    expect(p.rimThicknessFrac).toBeCloseTo(0.04, 6)
  })
})
