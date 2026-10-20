import { parseKstIso } from '../lib/kst'
import { ApiError } from './unwrapApiEnvelope'

// event.json의 모양. 형식은 `event.json 생성 구현 가이드 (MVP).md`가 확정한다. (CLAUDE.md §5.2)
export const H_VALUES = ['LEFT', 'CENTER', 'RIGHT'] as const
export const V_VALUES = ['TOP', 'MIDDLE', 'BOTTOM'] as const
export const THEMES = ['WHITE', 'WARM_ORANGE', 'DARK', 'BLUE'] as const
// 같은 칸에 여럿이 놓일 때 위에서부터 쌓는 고정 순서와 같다(확정).
export const ELEMENT_KEYS = ['title', 'banner', 'couponList', 'issueButton'] as const

export type H = (typeof H_VALUES)[number]
export type V = (typeof V_VALUES)[number]
export type Theme = (typeof THEMES)[number]
export type ElementKey = (typeof ELEMENT_KEYS)[number]
export type Pos = { h: H; v: V }
export type Layout = Record<ElementKey, Pos> & { theme: Theme }

export type EventInfo = {
  eventId: number // event.event_id. S3 경로의 {event_id}와 같다
  name: string // event.name
  entryOpenAt: string // 입장 OPEN 시각(세션 발급이 열리는 시각). start_at − 60분을 생성 쪽이 계산한다
  startAt: string // event.start_at
  endAt: string // event.end_at
  bannerUrl: string // 승인 때 live 폴더로 복사한 배너의 상대 경로(예: /banner.png)
  returnUrl: string // event.endpoint_url (테넌트 복귀 주소)
  layout: Layout // event.layout_config 그대로
}

// /event.json 읽기 실패. 화면 분류(403/404 → 없는 이벤트, 그 밖 → 연결 오류)는 lib/errors.ts가 정한다.
// status는 HTTP 상태 코드이고, 응답은 받았지만 형식이 틀린 경우는 그 응답의 상태 코드(보통 200)다.
export class EventInfoError extends ApiError {
  constructor(message: string, status: number | null = null) {
    super(message, null, status)
    this.name = 'EventInfoError'
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 정확히 이 키들만 있어야 한다. 빠져도, 다른 키가 섞여도 실패다.
function hasExactKeys(v: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(v)
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(v, k))
}

function isOneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return (values as readonly unknown[]).includes(v)
}

function parsePos(v: unknown): Pos | null {
  if (!isRecord(v) || !hasExactKeys(v, ['h', 'v'])) return null
  if (!isOneOf(H_VALUES, v.h) || !isOneOf(V_VALUES, v.v)) return null
  return { h: v.h, v: v.v }
}

// layout은 필수다. 키 5개가 모두 있고 값이 허용 목록 안이어야 하며 다른 키가 있으면 실패다.
// 일부만 기본값으로 메우거나 기본 레이아웃으로 바꾸지 않는다. 없거나 틀리면 배포 버그이므로 에러 화면으로 드러낸다(확정).
function parseLayout(v: unknown): Layout | null {
  if (!isRecord(v) || !hasExactKeys(v, [...ELEMENT_KEYS, 'theme'])) return null
  if (!isOneOf(THEMES, v.theme)) return null
  const title = parsePos(v.title)
  const banner = parsePos(v.banner)
  const couponList = parsePos(v.couponList)
  const issueButton = parsePos(v.issueButton)
  if (!title || !banner || !couponList || !issueButton) return null
  return { title, banner, couponList, issueButton, theme: v.theme }
}

// event.json을 검증한다. 8개 필드가 모두 필수다. 최상위의 다른 필드는 무시한다
// ("다른 필드를 넣지 않는다"는 생성 쪽 규칙이다, 확정).
// 시각 3개는 `YYYY-MM-DDTHH:mm:ss+09:00`만 통과시키고(확정) entryOpenAt ≤ startAt < endAt이어야 한다.
// entryOpenAt은 startAt에서 다시 계산하지 않고 파일의 값만 쓴다.
export function parseEventInfo(data: unknown): EventInfo {
  const invalid = (reason: string) => new EventInfoError(`event.json 형식 오류: ${reason}`, 200)
  if (!isRecord(data)) throw invalid('객체가 아님')

  const { eventId, name, entryOpenAt, startAt, endAt, bannerUrl, returnUrl } = data
  if (typeof eventId !== 'number' || !Number.isInteger(eventId) || eventId <= 0) throw invalid('eventId')
  if (typeof name !== 'string') throw invalid('name')

  const entryOpenAtMs = parseKstIso(entryOpenAt)
  const startAtMs = parseKstIso(startAt)
  const endAtMs = parseKstIso(endAt)
  if (entryOpenAtMs === null) throw invalid('entryOpenAt')
  if (startAtMs === null) throw invalid('startAt')
  if (endAtMs === null) throw invalid('endAt')
  if (!(endAtMs > startAtMs)) throw invalid('endAt이 startAt보다 뒤가 아님')
  if (!(entryOpenAtMs <= startAtMs)) throw invalid('entryOpenAt이 startAt보다 뒤')

  // 승인된 이벤트는 배너가 항상 있지만, 빈 값이면 그리지 않는 규칙은 방어용으로 유지한다(빈 문자열 허용).
  if (typeof bannerUrl !== 'string') throw invalid('bannerUrl')
  // returnUrl은 이동 전에 화면 쪽에서 따로 검증한다(safeReturnUrl).
  if (typeof returnUrl !== 'string') throw invalid('returnUrl')

  const layout = parseLayout(data.layout)
  if (layout === null) throw invalid('layout')

  return {
    eventId,
    name,
    entryOpenAt: entryOpenAt as string,
    startAt: startAt as string,
    endAt: endAt as string,
    bannerUrl,
    returnUrl,
    layout,
  }
}
