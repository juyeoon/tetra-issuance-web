import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeOffset, now, syncServerTime } from './serverTime'

// 2026-10-15T08:00:00Z
const DATE_HEADER = 'Thu, 15 Oct 2026 08:00:00 GMT'
const DATE_MS = Date.UTC(2026, 9, 15, 8, 0, 0)

describe('computeOffset', () => {
  it('정상: (Date + Age) − 받은 시점', () => {
    expect(computeOffset(DATE_HEADER, '30', DATE_MS - 5000)).toBe(35000)
    // 브라우저 시계가 빠르면 음수
    expect(computeOffset(DATE_HEADER, '0', DATE_MS + 120000)).toBe(-120000)
  })

  it('Age가 없으면 0으로 본다', () => {
    expect(computeOffset(DATE_HEADER, null, DATE_MS - 5000)).toBe(5000)
  })

  it('Date가 없으면 보정하지 않는다', () => {
    expect(computeOffset(null, '30', DATE_MS)).toBe(0)
  })

  it('Date 형식 오류면 보정하지 않는다', () => {
    expect(computeOffset('not a date', '30', DATE_MS)).toBe(0)
    expect(computeOffset('', '30', DATE_MS)).toBe(0)
  })

  it('Age가 숫자가 아니면 Age를 0으로 보고 Date만으로 보정한다', () => {
    expect(computeOffset(DATE_HEADER, 'abc', DATE_MS - 5000)).toBe(5000)
    expect(computeOffset(DATE_HEADER, '-3', DATE_MS - 5000)).toBe(5000)
    expect(computeOffset(DATE_HEADER, '1.5', DATE_MS - 5000)).toBe(5000)
    expect(computeOffset(DATE_HEADER, '', DATE_MS - 5000)).toBe(5000)
  })
})

describe('now', () => {
  afterEach(() => {
    syncServerTime(null, null)
    vi.useRealTimers()
  })

  it('syncServerTime 뒤에는 보정된 시각을 돌려준다', () => {
    vi.useFakeTimers()
    // 브라우저 시계가 서버보다 3분 빠르다
    vi.setSystemTime(DATE_MS + 180000)
    syncServerTime(DATE_HEADER, '10')
    expect(now()).toBe(DATE_MS + 10000)
    vi.advanceTimersByTime(1000)
    expect(now()).toBe(DATE_MS + 11000)
  })
})
