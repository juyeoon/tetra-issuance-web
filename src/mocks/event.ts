import { devConfig } from '../config'
import { toKstIsoString } from '../lib/kst'
import { deviceNow } from '../lib/serverTime'
// 더미 배너는 개발 빌드 전용이다. public/에 두거나 일반 자산으로 import하면 참조가 tree-shaking되어도 파일이
// dist/에 나오므로, data URL(?inline)로 이 모듈 안에 넣는다. 운영 번들에서는 이 모듈과 함께 빠진다.
import bannerDummyUrl from './banner-dummy.svg?inline'

// 개발 빌드 전용 목 /event.json과 서버 시각 응답(/api/issuance/time). 개발 서버는 두 경로를 서빙하지 않으므로
// 개발 빌드에서는 항상 이 목을 쓴다. src/api/의 import.meta.env.DEV 분기에서만 불리므로 운영 번들에서 빠진다. (CLAUDE.md §9)
// 실제 응답과 같은 경로(상태 코드, content-type, Date 헤더, 시간 응답 → 서버 시각 보정, parseEventInfo)를 타도록
// Response 객체로 돌려준다. 옵션 값이 틀리면 그 값을 그대로 넣고 검증은 parseEventInfo가 한다.

function numberParam(params: URLSearchParams, name: string): number | null {
  const raw = params.get(name)
  if (raw === null || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

// ?event=<id>가 숫자면 그 값, 아니면 devConfig.defaultEventId
function mockEventId(params: URLSearchParams): number {
  const value = params.get('event')
  return value !== null && /^\d+$/.test(value) ? Number(value) : devConfig.defaultEventId
}

// 배너 렌더링을 눈으로 확인할 수 있도록 기본값은 더미 이미지다. ?banner=를 빈 값으로 주면 배너 없음.
function mockBannerUrl(params: URLSearchParams): string {
  if (params.has('banner')) return params.get('banner') ?? ''
  return bannerDummyUrl
}

// ?titlePos=<V>-<H> 등 요소별 위치. 예: ?titlePos=TOP-LEFT. 값이 틀려도 그대로 넣는다(검증은 parseEventInfo).
// 이름 끝의 Pos는 ?banner=(배너 이미지 주소)와 겹치지 않게 하기 위한 것이다.
function mockPos(params: URLSearchParams, name: string, fallback: { h: string; v: string }): unknown {
  const raw = params.get(name)
  if (raw === null) return fallback
  const [v, h] = raw.split('-')
  return { h, v }
}

// ?theme=, ?<요소>Pos=로 목 layout을 만든다. ?layout=none은 layout을 빼고, ?layout=invalid는 허용되지 않는 값을 넣는다.
// 둘 다 기대 결과는 에러 화면이다(기본값으로 대체하지 않는다).
function mockLayout(params: URLSearchParams): unknown {
  const mode = params.get('layout')
  if (mode === 'none') return undefined
  const layout = {
    title: mockPos(params, 'titlePos', { h: 'CENTER', v: 'TOP' }),
    banner: mockPos(params, 'bannerPos', { h: 'CENTER', v: 'TOP' }),
    couponList: mockPos(params, 'couponListPos', { h: 'CENTER', v: 'MIDDLE' }),
    issueButton: mockPos(params, 'issueButtonPos', { h: 'CENTER', v: 'BOTTOM' }),
    theme: params.get('theme') ?? 'WHITE',
  }
  if (mode === 'invalid') return { ...layout, couponList: { h: 'CENTER', v: 'MID' } }
  return layout
}

// ?clockSkew=<초>: 목의 "서버 시각"을 실제 + n초로 꾸민다. event.json의 Date, 시간 응답, 목의 시각들이 모두 이 값을 쓴다.
function mockServerNowMs(params: URLSearchParams): number {
  return deviceNow() + (numberParam(params, 'clockSkew') ?? 0) * 1000
}

// 목 서버 시각 응답. 운영에서는 api-gate CloudFront Function이 { now: epoch ms }를 no-store로 돌려준다.
// ?timeApi=fail이면 네트워크 실패를 흉내 내 event.json의 Date로 대체하는 경로를 확인한다.
export function buildMockTimeResponse(search: string = window.location.search): Promise<Response> {
  const params = new URLSearchParams(search)
  if (params.get('timeApi') === 'fail') return Promise.reject(new TypeError('Failed to fetch'))
  return Promise.resolve(
    new Response(JSON.stringify({ now: mockServerNowMs(params) }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    }),
  )
}

export function buildMockEventJsonResponse(search: string = window.location.search): Promise<Response> {
  const params = new URLSearchParams(search)
  const serverNowMs = mockServerNowMs(params)

  // ?startsIn=<초>: startAt = 서버 시각 + n초(기본 15초). ?endsIn=<초>: endAt = 서버 시각 + n초(기본 startAt + 2시간).
  // ?endsIn=만 주면 startAt을 endAt − 2시간으로 둔다(?endsIn=-60처럼 이미 종료된 이벤트를 바로 볼 수 있게).
  const startsIn = numberParam(params, 'startsIn')
  const endsIn = numberParam(params, 'endsIn')
  const twoHoursMs = 2 * 60 * 60 * 1000
  const endAtMs = endsIn !== null ? serverNowMs + endsIn * 1000 : null
  const startAtMs =
    startsIn !== null ? serverNowMs + startsIn * 1000 : endAtMs !== null ? endAtMs - twoHoursMs : serverNowMs + 15 * 1000
  // 입장 OPEN 시각은 startAt − 60분 (생성 쪽 규칙과 같다)
  const entryOpenAtMs = startAtMs - 60 * 60 * 1000

  const body = {
    eventId: mockEventId(params),
    name: 'MVP 개발용 이벤트',
    entryOpenAt: toKstIsoString(entryOpenAtMs),
    startAt: toKstIsoString(startAtMs),
    endAt: toKstIsoString(endAtMs ?? startAtMs + twoHoursMs),
    bannerUrl: mockBannerUrl(params),
    // ?returnUrl=<주소>. 기본은 빈 문자열(돌아갈 곳 없음 경로 확인용)
    returnUrl: params.get('returnUrl') ?? '',
    // layout이 undefined면 JSON.stringify가 키를 빼므로 "layout 없음"이 된다.
    layout: mockLayout(params),
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    date: new Date(serverNowMs).toUTCString(),
  }
  // ?eventJsonAge=<초>: 엣지 캐시 응답처럼 Age를 붙인다. Date는 지금 시각 그대로라 Age를 더하면 그만큼 앞서 간다
  // (2026-10-28 dev 이벤트 12에서 카운트다운이 일찍 끝난 상황). 보정은 Age를 쓰지 않아야 한다.
  const age = params.get('eventJsonAge')
  if (age !== null) headers.age = age

  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers }))
}
