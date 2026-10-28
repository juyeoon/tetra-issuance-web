import { afterEach, describe, expect, it, vi } from 'vitest'
import { now, offsetFromDateHeader, offsetFromSample, setServerOffset } from './serverTime'

// 2026-10-15T08:00:00Z
const DATE_HEADER = 'Thu, 15 Oct 2026 08:00:00 GMT'
const DATE_MS = Date.UTC(2026, 9, 15, 8, 0, 0)

describe('offsetFromSample (시간 응답, 왕복 절반 보정)', () => {
  it('왕복이 0이면 서버 시각 − 받은 시각', () => {
    expect(offsetFromSample(DATE_MS, DATE_MS - 5000, DATE_MS - 5000)).toBe(5000)
  })

  it('서버가 ±60초 어긋나도 왕복의 절반만큼만 더해 맞춘다', () => {
    for (const skew of [60000, -60000]) {
      for (const rtt of [0, 200, 2000]) {
        const sentAt = DATE_MS
        const receivedAt = sentAt + rtt
        // 서버는 왕복 한가운데에서 응답을 만든다
        const serverMs = sentAt + rtt / 2 + skew
        const offset = offsetFromSample(serverMs, sentAt, receivedAt)
        // 받은 시점의 실제 서버 시각 = receivedAt + skew
        expect(receivedAt + offset, `skew=${skew} rtt=${rtt}`).toBe(receivedAt + skew)
      }
    }
  })

  it('받은 시각이 보낸 시각보다 앞서면(시계 되돌림) 왕복을 0으로 본다', () => {
    expect(offsetFromSample(DATE_MS, DATE_MS + 100, DATE_MS)).toBe(0)
  })
})

describe('offsetFromDateHeader (시간 응답을 못 받았을 때)', () => {
  it('Date − 받은 시각', () => {
    expect(offsetFromDateHeader(DATE_HEADER, DATE_MS - 5000)).toBe(5000)
    // 브라우저 시계가 빠르면 음수
    expect(offsetFromDateHeader(DATE_HEADER, DATE_MS + 120000)).toBe(-120000)
  })

  it('Date가 없거나 형식 오류면 보정하지 않는다', () => {
    expect(offsetFromDateHeader(null, DATE_MS)).toBe(0)
    expect(offsetFromDateHeader('not a date', DATE_MS)).toBe(0)
    expect(offsetFromDateHeader('', DATE_MS)).toBe(0)
  })
})

describe('now', () => {
  afterEach(() => {
    setServerOffset(0)
    vi.useRealTimers()
  })

  it('setServerOffset 뒤에는 보정된 시각을 돌려준다', () => {
    vi.useFakeTimers()
    // 브라우저 시계가 서버보다 3분 빠르다
    vi.setSystemTime(DATE_MS + 180000)
    setServerOffset(-180000)
    expect(now()).toBe(DATE_MS)
    vi.advanceTimersByTime(1000)
    expect(now()).toBe(DATE_MS + 1000)
  })
})
