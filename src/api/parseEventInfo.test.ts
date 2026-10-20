import { describe, expect, it } from 'vitest'
import { EventInfoError, parseEventInfo } from './parseEventInfo'

// 생성 가이드의 예시와 같은 값
const valid = {
  eventId: 1043,
  name: '추석맞이 전상품 쿠폰 발급',
  entryOpenAt: '2026-11-01T09:00:00+09:00',
  startAt: '2026-11-01T10:00:00+09:00',
  endAt: '2026-11-01T12:00:00+09:00',
  bannerUrl: '/banner.png',
  returnUrl: 'https://www.a-corp.com/event',
  layout: {
    title: { h: 'CENTER', v: 'TOP' },
    banner: { h: 'CENTER', v: 'TOP' },
    couponList: { h: 'CENTER', v: 'MIDDLE' },
    issueButton: { h: 'CENTER', v: 'BOTTOM' },
    theme: 'WHITE',
  },
}

function withLayout(patch: Record<string, unknown>) {
  return { ...valid, layout: { ...valid.layout, ...patch } }
}

function without(key: string, obj: Record<string, unknown> = valid) {
  const copy = { ...obj }
  delete copy[key]
  return copy
}

describe('parseEventInfo', () => {
  it('정상 event.json은 그대로 통과한다', () => {
    expect(parseEventInfo(valid)).toEqual(valid)
  })

  it('빈 bannerUrl, returnUrl은 통과한다(화면에서 따로 처리)', () => {
    expect(parseEventInfo({ ...valid, bannerUrl: '', returnUrl: '' })).toMatchObject({ bannerUrl: '', returnUrl: '' })
  })

  it('최상위의 다른 필드는 무시한다', () => {
    expect(parseEventInfo({ ...valid, extra: 1 })).toEqual(valid)
  })

  it('객체가 아니면 실패', () => {
    expect(() => parseEventInfo(null)).toThrow(EventInfoError)
    expect(() => parseEventInfo([valid])).toThrow(EventInfoError)
    expect(() => parseEventInfo('{}')).toThrow(EventInfoError)
  })

  it('필수 필드가 빠지거나 타입이 다르면 실패', () => {
    for (const key of ['eventId', 'name', 'bannerUrl', 'returnUrl']) {
      expect(() => parseEventInfo(without(key))).toThrow(EventInfoError)
    }
    expect(() => parseEventInfo({ ...valid, eventId: '1043' })).toThrow(EventInfoError)
    expect(() => parseEventInfo({ ...valid, eventId: 1.5 })).toThrow(EventInfoError)
    expect(() => parseEventInfo({ ...valid, eventId: 0 })).toThrow(EventInfoError)
    expect(() => parseEventInfo({ ...valid, bannerUrl: null })).toThrow(EventInfoError)
  })

  describe('시각', () => {
    it('endAt 누락은 실패', () => {
      expect(() => parseEventInfo(without('endAt'))).toThrow(EventInfoError)
    })

    it('endAt ≤ startAt은 실패', () => {
      expect(() => parseEventInfo({ ...valid, endAt: valid.startAt })).toThrow(EventInfoError)
      expect(() => parseEventInfo({ ...valid, endAt: '2026-11-01T09:59:59+09:00' })).toThrow(EventInfoError)
    })

    it('entryOpenAt 누락은 실패', () => {
      expect(() => parseEventInfo(without('entryOpenAt'))).toThrow(EventInfoError)
    })

    it('날짜로 해석할 수 없는 entryOpenAt은 실패', () => {
      expect(() => parseEventInfo({ ...valid, entryOpenAt: 'soon' })).toThrow(EventInfoError)
      expect(() => parseEventInfo({ ...valid, entryOpenAt: 123 })).toThrow(EventInfoError)
      expect(() => parseEventInfo({ ...valid, entryOpenAt: '2026-02-30T09:00:00+09:00' })).toThrow(EventInfoError)
    })

    it('entryOpenAt > startAt은 실패, entryOpenAt = startAt은 통과', () => {
      expect(() => parseEventInfo({ ...valid, entryOpenAt: '2026-11-01T10:00:01+09:00' })).toThrow(EventInfoError)
      expect(parseEventInfo({ ...valid, entryOpenAt: valid.startAt }).entryOpenAt).toBe(valid.startAt)
    })

    it('YYYY-MM-DDTHH:mm:ss+09:00 외의 형식(Z, 다른 오프셋, 소수점 초, 초 없음)은 실패', () => {
      for (const key of ['entryOpenAt', 'startAt', 'endAt']) {
        for (const bad of [
          '2026-11-01T01:00:00Z',
          '2026-11-01T10:00:00+00:00',
          '2026-11-01T10:00:00.000+09:00',
          '2026-11-01T10:00+09:00',
          '2026-11-01 10:00:00+09:00',
        ]) {
          expect(() => parseEventInfo({ ...valid, [key]: bad }), `${key}=${bad}`).toThrow(EventInfoError)
        }
      }
    })
  })

  describe('layout', () => {
    it('layout이 없으면 실패(기본값으로 대체하지 않는다)', () => {
      expect(() => parseEventInfo(without('layout'))).toThrow(EventInfoError)
    })

    it('문자열(이중 인코딩)이면 실패', () => {
      expect(() => parseEventInfo({ ...valid, layout: JSON.stringify(valid.layout) })).toThrow(EventInfoError)
    })

    it('요소 키가 빠지면 실패', () => {
      for (const key of ['title', 'banner', 'couponList', 'issueButton']) {
        expect(() => parseEventInfo({ ...valid, layout: without(key, valid.layout) }), key).toThrow(EventInfoError)
      }
    })

    it('theme이 빠지면 실패', () => {
      expect(() => parseEventInfo({ ...valid, layout: without('theme', valid.layout) })).toThrow(EventInfoError)
    })

    it('허용되지 않는 값은 실패("MID", 소문자 "top", 없는 테마)', () => {
      expect(() => parseEventInfo(withLayout({ couponList: { h: 'CENTER', v: 'MID' } }))).toThrow(EventInfoError)
      expect(() => parseEventInfo(withLayout({ title: { h: 'CENTER', v: 'top' } }))).toThrow(EventInfoError)
      expect(() => parseEventInfo(withLayout({ banner: { h: 'center', v: 'TOP' } }))).toThrow(EventInfoError)
      expect(() => parseEventInfo(withLayout({ theme: 'white' }))).toThrow(EventInfoError)
      expect(() => parseEventInfo(withLayout({ theme: 'GREEN' }))).toThrow(EventInfoError)
    })

    it('다른 키가 섞이면 실패(layout과 위치 객체 모두)', () => {
      expect(() => parseEventInfo(withLayout({ footer: { h: 'CENTER', v: 'BOTTOM' } }))).toThrow(EventInfoError)
      expect(() => parseEventInfo(withLayout({ title: { h: 'CENTER', v: 'TOP', z: 1 } }))).toThrow(EventInfoError)
    })

    it('위치 객체에 h나 v가 없으면 실패', () => {
      expect(() => parseEventInfo(withLayout({ issueButton: { h: 'CENTER' } }))).toThrow(EventInfoError)
      expect(() => parseEventInfo(withLayout({ issueButton: null }))).toThrow(EventInfoError)
    })

    it('4가지 테마와 9칸 위치가 모두 통과한다', () => {
      for (const theme of ['WHITE', 'WARM_ORANGE', 'DARK', 'BLUE']) {
        expect(parseEventInfo(withLayout({ theme })).layout.theme).toBe(theme)
      }
      for (const h of ['LEFT', 'CENTER', 'RIGHT']) {
        for (const v of ['TOP', 'MIDDLE', 'BOTTOM']) {
          expect(parseEventInfo(withLayout({ title: { h, v } })).layout.title).toEqual({ h, v })
        }
      }
    })
  })
})
