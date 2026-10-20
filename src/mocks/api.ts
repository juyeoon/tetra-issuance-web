import { deviceNow } from '../lib/serverTime'

// 개발 빌드 전용 API 목. src/api/의 import.meta.env.DEV 분기에서만 불리므로 운영 번들에서 빠진다. (CLAUDE.md §9)
// 실제 응답과 같은 경로(content-type 확인, { success, data } 봉투, 응답 parse, 에러 분류)를 타도록 Response 객체로
// 돌려준다. 옵션 값이 틀리면 그 값을 그대로 넣고 걸러내는 일은 실제 parse 함수가 한다.
//
// 쿼리
// - ?mockApi=1: 번호표, 커서, 쿠폰 목록, claim을 모두 목으로 응답한다(백엔드 없이 02 → 03 → 04 → 모달 확인).
// - ?ticket=<n>: 목 번호표 번호(기본 100). ?mockApi=1과 함께 쓴다.
// - ?cursorPerSec=<n>: 목 커서가 초당 올라가는 값(기본 20). 첫 커서 요청 때 0에서 시작한다.
// - ?cursorRegress=<n>, ?cursorFail=<n>|always: n번째 요청마다 커서를 역행시키거나 형식이 틀린 응답을 준다.
//   이 둘은 ?mockApi=1 없이도 커서만 목으로 바꾼다(PoC 때와 같다).
// - ?claimResult=SOLD_OUT: 목 claim 결과(기본 SUCCESS). ?mockApi=1과 함께 쓴다.
// - ?apiError=<code>: 번호표, 쿠폰 목록, claim이 이 코드의 에러 봉투를 돌려준다(?mockApi=1 없이도 동작).
//   예: ?apiError=SESSION_NOT_FOUND → 401. 커서는 인증이 없으므로 영향받지 않는다.
// - ?gateClosed=<초>|always: 엣지 게이트의 "입장 준비 중"을 흉내 낸다. 첫 API 요청부터 n초 동안(always면 계속)
//   번호표, 커서, 쿠폰 목록, claim이 본문 없는 503 + x-tetra-gate: entry-closed를 돌려준다. 그 뒤에는 평소대로다.
// - ?gateRetryAfter=<초>|none: 위 503의 Retry-After(기본 3초). none이면 헤더를 빼서 기본값(10초) 경로를 확인한다.

const MOCK_LATENCY_MS = 200

const MOCK_COUPONS = [
  { couponId: 1, name: '10% 할인 쿠폰', description: '전 상품 적용', remaining: 100 },
  { couponId: 2, name: '무료배송 쿠폰', description: '2만원 이상 구매 시', remaining: 100 },
  { couponId: 3, name: '2,000원 할인 쿠폰', description: '1만원 이상 구매 시', remaining: 100 },
]

// 에러 코드별 HTTP 상태 (CLAUDE.md §7.2). 목록에 없는 코드는 500으로 보낸다.
const STATUS_BY_CODE: Record<string, number> = {
  INVALID_REQUEST: 400,
  SESSION_NOT_FOUND: 401,
  SESSION_EVENT_MISMATCH: 403,
  EVENT_NOT_FOUND: 404,
  NOT_FOUND: 404,
  EVENT_NOT_STARTED: 409,
  EVENT_ENDED: 409,
  TICKET_REQUIRED: 409,
  ALREADY_CLAIMED: 409,
  INTERNAL_ERROR: 500,
}

type Route = 'ticket' | 'cursor' | 'coupons' | 'claim'

function routeOf(path: string, method: string): Route | null {
  if (method === 'POST' && /^\/api\/issuance\/events\/\d+\/ticket$/.test(path)) return 'ticket'
  if (method === 'GET' && /^\/api\/issuance\/events\/\d+\/queue\/cursor$/.test(path)) return 'cursor'
  if (method === 'GET' && /^\/api\/issuance\/events\/\d+\/coupons$/.test(path)) return 'coupons'
  if (method === 'POST' && /^\/api\/issuance\/events\/\d+\/coupons\/claim$/.test(path)) return 'claim'
  return null
}

function numberParam(params: URLSearchParams, name: string, fallback: number): number {
  const raw = params.get(name)
  const n = raw !== null && raw.trim() !== '' ? Number(raw) : NaN
  return Number.isFinite(n) ? n : fallback
}

function jsonResponse(status: number, body: unknown): Promise<Response> {
  const res = new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
  return new Promise((resolve) => setTimeout(() => resolve(res), MOCK_LATENCY_MS))
}

const ok = (data: unknown) => jsonResponse(200, { success: true, data })

function errorResponse(code: string): Promise<Response> {
  const status = STATUS_BY_CODE[code] ?? 500
  return jsonResponse(status, { success: false, error: { code, message: `개발용 목 에러: ${code}` } })
}

// --- 엣지 게이트 ---
let gateStartTime: number | null = null

function gateClosedNow(params: URLSearchParams): boolean {
  const raw = params.get('gateClosed')
  if (raw === null) return false
  if (raw === 'always') return true
  if (gateStartTime === null) gateStartTime = deviceNow()
  return deviceNow() - gateStartTime < numberParam(params, 'gateClosed', 0) * 1000
}

// CloudFront Function이 만드는 응답처럼 본문과 content-type이 없다.
function gateResponse(params: URLSearchParams): Promise<Response> {
  const headers: Record<string, string> = { 'x-tetra-gate': 'entry-closed' }
  const retryAfter = params.get('gateRetryAfter')
  if (retryAfter !== 'none') headers['retry-after'] = retryAfter ?? '3'
  const res = new Response(null, { status: 503, headers })
  return new Promise((resolve) => setTimeout(() => resolve(res), MOCK_LATENCY_MS))
}

// --- 커서 ---
let cursorStartTime: number | null = null
let cursorCallCount = 0

// 실패를 흉내 낼 때도 일부러 형식이 틀린 값을 돌려줘서 parseCursorResponse가 걸러내는 경로를 그대로 타게 한다.
function mockCursor(params: URLSearchParams): Promise<Response> {
  cursorCallCount += 1

  const failParam = params.get('cursorFail')
  const failsAlways = failParam === 'always'
  const failEveryN = failParam !== null && !failsAlways ? Number(failParam) : NaN
  if (failsAlways || (Number.isFinite(failEveryN) && failEveryN > 0 && cursorCallCount % failEveryN === 0)) {
    return ok({ cursor: 'not-a-number' })
  }

  const perSecParam = numberParam(params, 'cursorPerSec', 20)
  const perSec = perSecParam > 0 ? perSecParam : 20
  if (cursorStartTime === null) cursorStartTime = deviceNow()
  const trueCursor = Math.floor(((deviceNow() - cursorStartTime) / 1000) * perSec)

  const regressEveryN = numberParam(params, 'cursorRegress', NaN)
  if (Number.isFinite(regressEveryN) && regressEveryN > 0 && cursorCallCount % regressEveryN === 0) {
    // 1.5초분만큼 역행시킨다
    return ok({ cursor: Math.max(0, trueCursor - Math.round(perSec * 1.5)) })
  }
  return ok({ cursor: trueCursor })
}

// 목으로 응답할 요청이면 목 응답을, 아니면 null(실제 fetch)을 돌려준다.
export function mockApiResponse(
  path: string,
  method: string,
  search: string = window.location.search,
): Promise<Response> | null {
  const route = routeOf(path, method)
  if (route === null) return null
  const params = new URLSearchParams(search)
  const mockAll = params.get('mockApi') === '1'

  if (gateClosedNow(params)) return gateResponse(params)

  const apiError = params.get('apiError')
  if (apiError !== null && route !== 'cursor') return errorResponse(apiError)

  switch (route) {
    case 'cursor':
      return mockAll || params.has('cursorRegress') || params.has('cursorFail') ? mockCursor(params) : null
    case 'ticket':
      return mockAll ? ok({ ticketNumber: numberParam(params, 'ticket', 100) }) : null
    case 'coupons':
      return mockAll ? ok({ coupons: MOCK_COUPONS }) : null
    case 'claim': {
      if (!mockAll) return null
      const result = params.get('claimResult') ?? 'SUCCESS'
      const coupons =
        result === 'SUCCESS' ? MOCK_COUPONS.map(({ couponId, name, description }) => ({ couponId, name, description })) : []
      return ok({ result, coupons })
    }
  }
}
