// API 호출은 전부 이 모듈에만 둔다. 화면 코드는 fetch/axios를 직접 쓰지 않는다. (CLAUDE.md §7)
import { now, syncServerTime } from '../lib/serverTime'
import { mockApiResponse } from '../mocks/api'
import { buildMockEventJsonResponse } from '../mocks/event'
import { parseClaimResponse, type ClaimResult } from './parseClaimResponse'
import { parseCursorResponse } from './parseCursorResponse'
import { EventInfoError, parseEventInfo, type EventInfo } from './parseEventInfo'
import { parseRetryAfter } from './retryAfter'
import { ApiError, unwrapApiEnvelope } from './unwrapApiEnvelope'

export type { ElementKey, EventInfo } from './parseEventInfo'

export type Coupon = {
  couponId: number
  name: string
  description: string
}

export type { ClaimResult }


// 같은 호스트의 상대 경로만 쓴다. 절대 URL/호스트 하드코딩 금지. (CLAUDE.md §7, §10)
// 세션은 서버가 내려주는 HttpOnly 쿠키이므로 JS는 세션 id를 읽지도, 헤더에 싣지도 않는다. same-origin이면
// 브라우저가 쿠키를 자동으로 보내지만 명시적으로 밝혀 둔다. user_id도 절대 요청 본문에 넣지 않는다(서버가 세션에서 꺼냄).
// fetch는 HTTP 오류(res.ok가 false)에서 예외를 던지지 않으므로 직접 확인해 실패로 처리한다. (CLAUDE.md §7.1)
// /event.json을 뺀 API 4개는 모두 { success, data } / { success:false, error:{code,message} } 봉투다. 에러 응답(4xx/5xx)도
// 본문이 봉투이므로 읽어서 error.code를 ApiError에 싣는다. 본문을 읽을 수 없으면 상태 코드만 싣는다.
// JSON 파싱 전에 content-type을 확인한다. 502/504 본문은 CloudFront가 만든 HTML이므로
// 읽지 않고 상태 코드로만 판단한다. 200이어도 JSON이 아니면 실패다. 429/502/503/504는 인프라가 만든
// 응답이라 본문의 code를 쓰지 않는다. (CLAUDE.md §7.1)
// TODO(미정): 번호표, 쿠폰 목록, claim 응답의 Cache-Control: no-store 반영 시점(백엔드 "반영 예정"). 프런트는
// 이 요청들에 캐시 관련 옵션을 붙이지 않으므로 코드 변경은 없고, 반영 뒤 CloudFront에서 캐시되지 않는지 확인한다. (CLAUDE.md §13)
const INFRA_STATUSES = [429, 502, 503, 504]

function isJsonResponse(res: Response): boolean {
  return /application\/json/i.test(res.headers.get('content-type') ?? '')
}

// 엣지 게이트(CloudFront api-gate Function)는 입장 준비 전(KVS entryOpen=false)에 본문 없는 503과
// x-tetra-gate: entry-closed, Retry-After를 준다. 헤더 값은 ApiError.gate에 담고, 화면 분류는 lib/errors.ts가 한다.
async function readEnvelope(res: Response, label: string): Promise<unknown> {
  const status = res.status
  const retryAfterMs = res.ok ? null : parseRetryAfter(res.headers.get('retry-after'), now())
  const gate = res.ok ? null : res.headers.get('x-tetra-gate')
  const failure = (code: string | null, message: string = `요청 실패: ${label} -> ${status}`) =>
    new ApiError(message, code, status, retryAfterMs, gate)

  if (!isJsonResponse(res)) throw failure(null)
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw failure(null)
  }
  if (!res.ok) {
    if (!INFRA_STATUSES.includes(status)) {
      try {
        unwrapApiEnvelope(body, status)
      } catch (e) {
        if (e instanceof ApiError && e.code !== null) throw failure(e.code, e.message)
      }
    }
    throw failure(null)
  }
  return unwrapApiEnvelope(body, status)
}

// 개발 빌드에서만 목 응답(src/mocks/api.ts)을 끼워 넣는다. 목 쿼리가 없으면 실제 fetch다.
// 운영 번들에서는 import.meta.env.DEV가 false라 이 분기와 목 모듈이 빠진다. (CLAUDE.md §9)
function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (import.meta.env.DEV) {
    const mocked = mockApiResponse(path, init?.method ?? 'GET')
    if (mocked !== null) return mocked
  }
  return init === undefined ? fetch(path) : fetch(path, init)
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await apiFetch(path, {
    credentials: 'same-origin',
    ...init,
  })
  return readEnvelope(res, `${init?.method ?? 'GET'} ${path}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 번호표 응답 data는 { ticketNumber: number }. 화면 코드가 쓰는 { ticket }으로 옮겨 담는다.
// 화면 코드의 이름은 ticket 그대로 두고 여기서만 옮겨 담는다. (확정)
export async function requestTicket(eventId: number): Promise<{ ticket: number }> {
  const data = await request(`/api/issuance/events/${eventId}/ticket`, { method: 'POST' })
  if (!isRecord(data) || typeof data.ticketNumber !== 'number' || !Number.isFinite(data.ticketNumber)) {
    throw new ApiError('번호표 응답 형식 오류')
  }
  return { ticket: data.ticketNumber }
}

// 서빙 커서. CloudFront 엣지에서 캐시되므로(CLAUDE.md §8) 캐시 무효화 쿼리, fetch의 cache 옵션,
// 커스텀 헤더, credentials 옵션 변경을 하지 않는다 — 같은 호스트 상대 경로에 대한 기본 fetch 그대로 둔다.
// 이 경로는 인증이 없다(2026-10-01 확인, CDN 캐시 대상이라 세션 쿠키도 필요 없음).
// 4xx/5xx는 실제 상태 코드로 오므로(index.html로 안 바뀜) res.ok로 실패를 판단한다.
// 응답은 { success, data: { cursor } } 공통 봉투 형식이라(2026-10-01 변경) unwrapApiEnvelope로
// data를 꺼낸 뒤, parseCursorResponse로 그 안의 { cursor: number } 모양까지 검증한다.
export async function getQueueCursor(eventId: number): Promise<{ cursor: number }> {
  const res = await apiFetch(`/api/issuance/events/${eventId}/queue/cursor`)
  return parseCursorResponse(await readEnvelope(res, 'GET queue/cursor'))
}

// 이벤트 정보. 같은 호스트의 정적 파일 /event.json만 읽는다(/info는 쓰지 않는다). (CLAUDE.md §5.1)
// S3 정적 파일이라 { success, data } 봉투가 없어 readEnvelope를 쓰지 않고, content-type 확인과 상태 코드 판단만
// 같은 방식으로 한다. 엣지에 60초 캐시되므로(s-maxage=60) 캐시 무효화 쿼리, 커스텀 헤더, fetch의 cache 옵션을
// 붙이지 않는다. 응답의 Date, Age 헤더로 서버 시각 보정값을 한 번 계산한다(§5.3).
// 실패는 EventInfoError로 던지고, 화면 분류(403/404 → 없는 이벤트, 그 밖 → 연결 오류)는 lib/errors.ts가 정한다.
// 개발 빌드에서는 개발 서버에 /event.json이 없으므로 항상 목을 쓴다(운영 번들에서는 이 분기가 빠진다, §9).
export async function getEventInfo(): Promise<EventInfo> {
  const res = import.meta.env.DEV ? await buildMockEventJsonResponse() : await fetch('/event.json')
  if (!res.ok) throw new EventInfoError(`요청 실패: GET /event.json -> ${res.status}`, res.status)
  syncServerTime(res.headers.get('date'), res.headers.get('age'))
  if (!isJsonResponse(res)) throw new EventInfoError('event.json이 JSON이 아님', res.status)
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new EventInfoError('event.json 파싱 실패', res.status)
  }
  return parseEventInfo(body)
}

// 쿠폰 목록 응답 data는 { coupons: [...] }. 배열을 꺼내 돌려준다.
// 응답 항목에는 remaining(Redis 실시간 재고)도 오지만 화면에 보여 주지 않기로 확정해서 타입에 두지 않는다.
export async function getCoupons(eventId: number): Promise<Coupon[]> {
  const data = await request(`/api/issuance/events/${eventId}/coupons`)
  if (!isRecord(data) || !Array.isArray(data.coupons)) {
    throw new ApiError('쿠폰 목록 응답 형식 오류')
  }
  return data.coupons as Coupon[]
}

// claim 응답은 { success, data } 봉투이고, data의 result(SUCCESS / SOLD_OUT)와 coupons 형식은 parseClaimResponse가
// 검증한다. 결과 이름은 서버 값 그대로 쓴다(SOLD_OUT, 확정). 품절도 HTTP 200이다.
// 같은 사용자가 다시 보내면 처음 결과가 200으로 그대로 온다(백엔드 확인). 그래서 claim 쪽에는 ALREADY_CLAIMED 처리가 없다.
export async function claimCoupons(eventId: number): Promise<{ result: ClaimResult }> {
  const data = await request(`/api/issuance/events/${eventId}/coupons/claim`, { method: 'POST' })
  return parseClaimResponse(data)
}
