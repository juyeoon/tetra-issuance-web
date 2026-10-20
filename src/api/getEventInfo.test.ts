import { afterEach, describe, expect, it, vi } from 'vitest'
import { getErrorNotice } from '../lib/errors'
import { now, syncServerTime } from '../lib/serverTime'
import { getEventInfo } from '.'

const validBody = {
  eventId: 1043,
  name: '이벤트',
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

async function noticeFor() {
  try {
    await getEventInfo()
  } catch (e) {
    return getErrorNotice(e)
  }
  throw new Error('예외가 던져지지 않음')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
  syncServerTime(null, null)
})

describe('getEventInfo (운영 경로: /event.json)', () => {
  function mockFetch(response: () => Response | Promise<Response>) {
    vi.stubEnv('DEV', false)
    const fn = vi.fn(async () => response())
    vi.stubGlobal('fetch', fn)
    return fn
  }

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    })

  it('상대 경로 /event.json만 옵션 없이 읽는다', async () => {
    const fn = mockFetch(json(200, validBody))
    await expect(getEventInfo()).resolves.toEqual(validBody)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0]).toEqual(['/event.json'])
  })

  it('Date, Age 헤더로 now()를 보정한다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 9, 15, 8, 3, 0)) // 브라우저 시계가 3분 빠름
    mockFetch(json(200, validBody, { date: 'Thu, 15 Oct 2026 08:00:00 GMT', age: '20' }))
    await getEventInfo()
    expect(now()).toBe(Date.UTC(2026, 9, 15, 8, 0, 20))
  })

  it('403, 404는 존재하지 않는 이벤트(403을 권한 없음으로 보지 않는다)', async () => {
    for (const status of [403, 404]) {
      mockFetch(() => new Response('', { status, headers: { 'content-type': 'application/xml' } }))
      const n = await noticeFor()
      expect(n.situation, String(status)).toBe('notFound')
      expect(n.message).toBe('존재하지 않는 이벤트입니다.')
      expect(n.action).toBe('none')
    }
  })

  it('5xx, JSON 아님, 깨진 JSON, 검증 실패, 네트워크 예외는 연결 오류 + 다시 시도', async () => {
    const cases: Array<() => Response | Promise<Response>> = [
      () => new Response('<html></html>', { status: 503, headers: { 'content-type': 'text/html' } }),
      () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } }),
      json(200, { ...validBody, layout: undefined }),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]
    for (const [i, c] of cases.entries()) {
      mockFetch(c)
      const n = await noticeFor()
      expect(n.situation, `case ${i}`).toBe('network')
      expect(n.message).toBe('일시적으로 연결이 원활하지 않아요')
      expect(n.action).toBe('retry')
    }
  })
})

describe('getEventInfo (개발 빌드: 목 event.json)', () => {
  function withSearch(search: string) {
    vi.stubGlobal('window', { location: { search } })
    const fn = vi.fn()
    vi.stubGlobal('fetch', fn)
    return fn
  }

  it('fetch 없이 목을 쓰고, 목은 parseEventInfo를 통과한다', async () => {
    const fn = withSearch('?event=7&returnUrl=https://example.com/back')
    const info = await getEventInfo()
    expect(fn).not.toHaveBeenCalled()
    expect(info.eventId).toBe(7)
    expect(info.returnUrl).toBe('https://example.com/back')
    // entryOpenAt = startAt − 60분
    expect(new Date(info.startAt).getTime() - new Date(info.entryOpenAt).getTime()).toBe(60 * 60 * 1000)
  })

  it('?event=가 없으면 기본 eventId 1', async () => {
    withSearch('')
    expect((await getEventInfo()).eventId).toBe(1)
  })

  it('?endsIn=-60만 주면 이미 종료된 이벤트(endAt > startAt 유지)', async () => {
    withSearch('?endsIn=-60')
    const info = await getEventInfo()
    expect(new Date(info.endAt).getTime()).toBeLessThan(now())
    expect(new Date(info.endAt).getTime()).toBeGreaterThan(new Date(info.startAt).getTime())
  })

  it('?clockSkew=로 Date를 꾸미면 now()가 그만큼 보정된다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 9, 15, 8, 0, 0))
    withSearch('?clockSkew=-300')
    await getEventInfo()
    expect(now()).toBe(Date.UTC(2026, 9, 15, 7, 55, 0))
  })

  it('?theme=, ?<요소>Pos=로 목 layout을 바꾼다', async () => {
    withSearch('?theme=DARK&titlePos=TOP-LEFT&issueButtonPos=BOTTOM-RIGHT')
    const { layout } = await getEventInfo()
    expect(layout.theme).toBe('DARK')
    expect(layout.title).toEqual({ h: 'LEFT', v: 'TOP' })
    expect(layout.issueButton).toEqual({ h: 'RIGHT', v: 'BOTTOM' })
    expect(layout.couponList).toEqual({ h: 'CENTER', v: 'MIDDLE' })
  })

  it('?layout=none, ?layout=invalid, 틀린 옵션 값은 에러 화면(연결 오류)으로 간다', async () => {
    for (const search of ['?layout=none', '?layout=invalid', '?theme=GREEN', '?titlePos=TOP']) {
      withSearch(search)
      const n = await noticeFor()
      expect(n.situation, search).toBe('network')
    }
  })
})
