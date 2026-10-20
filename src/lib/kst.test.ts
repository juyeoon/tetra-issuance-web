import { describe, expect, it } from 'vitest'
import { formatKstHHmm, parseKstIso, toKstIsoString } from './kst'

describe('kst', () => {
  it('toKstIsoString은 브라우저 시간대와 무관하게 KST로 표기한다', () => {
    expect(toKstIsoString(Date.UTC(2026, 10, 1, 1, 0, 0))).toBe('2026-11-01T10:00:00+09:00')
    // UTC로는 전날
    expect(toKstIsoString(Date.UTC(2026, 9, 31, 15, 30, 5))).toBe('2026-11-01T00:30:05+09:00')
  })

  it('parseKstIso는 형식에 맞는 값만 epoch ms로 바꾼다', () => {
    expect(parseKstIso('2026-11-01T10:00:00+09:00')).toBe(Date.UTC(2026, 10, 1, 1, 0, 0))
    expect(parseKstIso('2026-11-01T01:00:00Z')).toBeNull()
    expect(parseKstIso('2026-02-29T10:00:00+09:00')).toBeNull()
    expect(parseKstIso('2026-13-01T10:00:00+09:00')).toBeNull()
    expect(parseKstIso(undefined)).toBeNull()
  })

  it('formatKstHHmm은 브라우저 시간대와 무관하게 KST 시:분을 돌려준다', () => {
    expect(formatKstHHmm(Date.UTC(2026, 10, 1, 0, 5, 59))).toBe('09:05')
    expect(formatKstHHmm(Date.UTC(2026, 9, 31, 15, 0, 0))).toBe('00:00')
  })
})
