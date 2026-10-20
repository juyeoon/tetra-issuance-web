import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/unwrapApiEnvelope'
import { gateRetryDelayFor, gateRetryDelayMs, isGateClosed } from './gateRetry'

describe('isGateClosed', () => {
  it('503 + x-tetra-gate: entry-closed만 게이트 503이다', () => {
    expect(isGateClosed(new ApiError('x', null, 503, 5000, 'entry-closed'))).toBe(true)
    expect(isGateClosed(new ApiError('x', null, 503, 5000, null))).toBe(false)
    expect(isGateClosed(new ApiError('x', null, 503, null, 'other'))).toBe(false)
    expect(isGateClosed(new ApiError('x', null, 404, null, 'entry-closed'))).toBe(false)
    expect(isGateClosed(new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('gateRetryDelayMs', () => {
  it('Retry-After의 1~2배 사이다', () => {
    expect(gateRetryDelayMs(5000, 0)).toBe(5000)
    expect(gateRetryDelayMs(5000, 0.5)).toBe(7500)
    expect(gateRetryDelayMs(5000, 0.999)).toBe(9995)
  })

  it('Retry-After가 없거나 0이면 기본 10초를 기준으로 한다', () => {
    expect(gateRetryDelayMs(null, 0)).toBe(10000)
    expect(gateRetryDelayMs(0, 0.5)).toBe(15000)
  })

  it('무작위 값을 주지 않으면 기준값의 1~2배 안에서 고른다', () => {
    for (let i = 0; i < 50; i++) {
      const d = gateRetryDelayMs(3000)
      expect(d).toBeGreaterThanOrEqual(3000)
      expect(d).toBeLessThanOrEqual(6000)
    }
  })

  it('gateRetryDelayFor는 예외의 Retry-After를 쓴다', () => {
    expect(gateRetryDelayFor(new ApiError('x', null, 503, 2000, 'entry-closed'), 0.5)).toBe(3000)
    expect(gateRetryDelayFor(new Error('x'), 0)).toBe(10000)
  })
})
