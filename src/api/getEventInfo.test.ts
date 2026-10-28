import { afterEach, describe, expect, it, vi } from 'vitest'
import { getErrorNotice } from '../lib/errors'
import { now, setServerOffset } from '../lib/serverTime'
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

// 브라우저 시계. 초 단위 경계로 두어 Date 헤더(초 단위)와 정확히 비교한다.
const DEVICE_MS = Date.UTC(2026, 9, 28, 0, 58, 0)

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
  setServerOffset(0)
})

describe('getEventInfo (운영 경로: /event.json + 시간 응답)', () => {
  type Handler = () => Response | Promise<Response>

  // /event.json과 /api/issuance/time을 따로 흉내 낸다.
  function mockFetch(eventJson: Handler, time: Handler = () => Promise.reject(new TypeError('Failed to fetch'))) {
    vi.stubEnv('DEV', false)
    const fn = vi.fn(async (url: string) => (url === '/event.json' ? eventJson() : time()))
    vi.stubGlobal('fetch', fn)
    return fn
  }

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    })

  // 엣지 캐시 응답: Date는 지금 시각 그대로, Age는 캐시된 시간
  const cachedEventJson = (ageSec: number) =>
    json(200, validBody, { date: new Date(Date.now()).toUTCString(), age: String(ageSec) })

  // 시간 응답: 왕복 rttMs 동안 시계를 흘리고, 서버는 왕복 한가운데에서 serverSkewMs만큼 어긋난 시각을 만든다.
  const timeResponse =
    (serverSkewMs: number, rttMs = 0, serverAt = 0.5): Handler =>
    () => {
      const sentAt = Date.now()
      vi.setSystemTime(sentAt + rttMs)
      return json(200, { now: sentAt + rttMs * serverAt + serverSkewMs }, { 'cache-control': 'no-store' })()
    }

  it('/event.json은 옵션 없이 한 번, 시간 응답은 /api/issuance/time으로 읽는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_MS)
    const fn = mockFetch(json(200, validBody), timeResponse(0))
    await expect(getEventInfo()).resolves.toEqual(validBody)
    const eventJsonCalls = fn.mock.calls.filter(([url]) => url === '/event.json')
    expect(eventJsonCalls).toEqual([['/event.json']])
    expect(fn.mock.calls.filter(([url]) => url === '/api/issuance/time')).toHaveLength(3)
  })

  it('시간 응답으로 보정한다(서버 ±60초, 왕복 절반 보정)', async () => {
    vi.useFakeTimers()
    for (const skew of [60000, -60000]) {
      vi.setSystemTime(DEVICE_MS)
      mockFetch(cachedEventJson(40), timeResponse(skew, 200))
      await getEventInfo()
      expect(now() - Date.now(), `skew=${skew}`).toBe(skew)
    }
  })

  it('표본 중 왕복이 가장 짧은 것을 쓴다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_MS)
    // 왕복 300, 100, 500ms. 응답이 왕복의 90% 지점에서 만들어져(비대칭) 왕복이 길수록 오차가 커진다.
    const rtts = [300, 100, 500]
    let i = 0
    mockFetch(json(200, validBody), () => timeResponse(0, rtts[i++], 0.9)())
    await getEventInfo()
    // 오차 = 왕복 × 0.4. 왕복 100ms 표본이면 40ms
    expect(now() - Date.now()).toBe(40)
  })

  it('[회귀 10-28] 시간 응답이 없으면 Date만 쓰고 Age는 더하지 않는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_MS)
    mockFetch(cachedEventJson(40))
    await getEventInfo()
    // 예전 계산(Date + Age)이면 40초 앞서 간다
    expect(Math.abs(now() - Date.now())).toBeLessThan(1000)
  })

  it('[회귀 10-28] 새로고침을 반복해 Age가 0~59로 바뀌어도 보정값이 흔들리지 않는다', async () => {
    vi.useFakeTimers()
    for (let reload = 0; reload < 10; reload++) {
      vi.setSystemTime(DEVICE_MS + reload * 6000)
      mockFetch(cachedEventJson(reload * 6))
      await getEventInfo()
      expect(Math.abs(now() - Date.now()), `reload=${reload}`).toBeLessThan(1000)
    }
  })

  it('시간 응답이 404, JSON 아님, 형식 오류면 Date로 대체하고 더 묻지 않는다', async () => {
    vi.useFakeTimers()
    const badTimes: Handler[] = [
      () => new Response('', { status: 404 }),
      () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      json(200, { now: 'soon' }),
      json(503, { now: Date.now() }),
    ]
    for (const [i, bad] of badTimes.entries()) {
      vi.setSystemTime(DEVICE_MS)
      // 서버 Date가 브라우저보다 5초 빠르다
      const fn = mockFetch(json(200, validBody, { date: new Date(DEVICE_MS + 5000).toUTCString(), age: '30' }), bad)
      await getEventInfo()
      expect(now() - Date.now(), `case ${i}`).toBe(5000)
      expect(fn.mock.calls.filter(([url]) => url === '/api/issuance/time'), `case ${i}`).toHaveLength(1)
    }
  })

  it('Date도 없고 시간 응답도 없으면 보정하지 않는다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_MS)
    mockFetch(json(200, validBody))
    await getEventInfo()
    expect(now()).toBe(Date.now())
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
    const cases: Handler[] = [
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

describe('getEventInfo (개발 빌드: 목 event.json + 목 시간 응답)', () => {
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

  it('?clockSkew=로 서버 시각을 꾸미면 시간 응답으로 now()가 그만큼 보정된다', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_MS)
    withSearch('?clockSkew=-300')
    await getEventInfo()
    expect(now()).toBe(DEVICE_MS - 300000)
  })

  it('?timeApi=fail이면 event.json의 Date로 대체한다(?clockSkew= 반영)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(DEVICE_MS)
    withSearch('?timeApi=fail&clockSkew=-300')
    await getEventInfo()
    expect(now()).toBe(DEVICE_MS - 300000)
  })

  it('[회귀 10-28] ?eventJsonAge=40을 붙여도 지금 시각이 앞서 가지 않는다(시간 응답, Date 대체 모두)', async () => {
    vi.useFakeTimers()
    for (const search of ['?eventJsonAge=40', '?eventJsonAge=40&timeApi=fail']) {
      vi.setSystemTime(DEVICE_MS)
      withSearch(search)
      await getEventInfo()
      expect(now(), search).toBe(DEVICE_MS)
    }
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
