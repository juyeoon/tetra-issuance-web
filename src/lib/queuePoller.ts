import { getQueueCursor } from '../api'
import { isRetryableError } from '../api/isRetryableError'
import { config } from '../config'
import { gateRetryDelayFor, isGateClosed } from './gateRetry'
import { now } from './serverTime'

// 경계값은 폴링 스펙(docs/api/폴링 클라이언트 구현 스펙.md)의 예시 코드와 동일하게 '초과(>)' 기준이다. (확정)
// TODO(미정): 폴링 간격과 실패 판정 시간은 MVP 부하 측정 결과(플랜별 수용 인원 1만~10만)를 보고 다시 조정한다. (CLAUDE.md §8, §13)
export function computeDelay(gap: number): number {
  if (gap > 10000) return 10000
  if (gap > 1000) return 5000
  if (gap > 100) return 2000
  return 1000
}

// 서로 다른 CloudFront 엣지 캐시를 번갈아 받으면 커서가 뒤로 갈 수 있다. 지금까지 받은 커서의
// 최댓값만 쓰고, 작은 값이 오면 무시한다. 같은 값이 연속으로 오는 것은 정상이다. (폴링 스펙 §4, CLAUDE.md §8)
export function mergeCursor(prevMax: number | null, received: number): number {
  if (prevMax === null) return received
  return Math.max(prevMax, received)
}

export type QueuePollingState = {
  cursor: number | null
  gap: number | null
  // 실패가 이어지는 중이지만 아직 15초 전이다. 대기열 화면을 유지하고 작은 지연 표시만 띄운다.
  delayed: boolean
  // 엣지 게이트가 입장 준비 중(503, x-tetra-gate: entry-closed)이라고 답했다. 대기열 화면을 유지하고 준비 중 표시를 띄운다.
  preparing: boolean
  // 실패가 15초 이상 이어졌거나 재시도해도 소용없는 오류(4xx)다. 전체 에러 UI를 띄운다.
  failed: boolean
  // 포기한 원인. 에러 화면을 고르는 데 쓴다.
  error: unknown
}

export const initialPollingState: QueuePollingState = {
  cursor: null,
  gap: null,
  delayed: false,
  preparing: false,
  failed: false,
  error: null,
}

type Options = {
  eventId: number
  ticket: number
  onChange: (state: QueuePollingState) => void
  getCursor?: (eventId: number) => Promise<{ cursor: number }>
}

// 응답마다 setTimeout을 다시 거는 재귀 방식 폴링. 돌려주는 함수를 부르면 멈춘다.
// 실패 처리 (CLAUDE.md §8, 폴링 스펙 6번 대체):
// - 횟수가 아니라 시간으로 판단한다. 첫 실패 시각을 기록하고 config.pollingFailureLimitMs 이상 이어질 때만 failed.
//   성공 응답이 한 번이라도 오면 초기화한다.
// - 그 전에는 마지막 커서와 gap을 그대로 둔 채 delayed만 켠다.
// - 실패 중에도 원래 폴링 간격 그대로 재시도한다(백오프 없음). 캐시된 502는 엣지에서 바로 오므로 오리진 부하가 없다.
// - 재시도해도 소용없는 오류(4xx)는 바로 failed.
// - 엣지 게이트의 503(입장 준비 중)은 실패 시간에 세지 않는다. 마지막 커서와 gap을 둔 채 preparing만 켜고,
//   Retry-After의 1~2배를 기다린 뒤 다시 묻는다. (사용자 결정 2026-10-16)
export function startQueuePolling({ eventId, ticket, onChange, getCursor = getQueueCursor }: Options): () => void {
  let cancelled = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let maxCursor: number | null = null
  let failureStartedAt: number | null = null
  // 아직 성공한 적이 없으면 최소 폴링 간격(1초)을 쓴다.
  let lastDelayMs = computeDelay(0)
  let state = initialPollingState

  function emit(patch: Partial<QueuePollingState>) {
    state = { ...state, ...patch }
    onChange(state)
  }

  async function poll() {
    try {
      const res = await getCursor(eventId)
      if (cancelled) return
      failureStartedAt = null
      maxCursor = mergeCursor(maxCursor, res.cursor)
      const gap = ticket - maxCursor
      emit({ cursor: maxCursor, gap, delayed: false, preparing: false, failed: false, error: null })
      if (gap > 0) {
        lastDelayMs = computeDelay(gap)
        timeoutId = setTimeout(poll, lastDelayMs)
      }
    } catch (e) {
      if (cancelled) return
      if (isGateClosed(e)) {
        emit({ delayed: false, preparing: true })
        timeoutId = setTimeout(poll, gateRetryDelayFor(e))
        return
      }
      if (!isRetryableError(e)) {
        emit({ delayed: false, preparing: false, failed: true, error: e })
        return
      }
      const t = now()
      if (failureStartedAt === null) failureStartedAt = t
      if (t - failureStartedAt >= config.pollingFailureLimitMs) {
        emit({ delayed: false, preparing: false, failed: true, error: e })
        return
      }
      emit({ delayed: true, preparing: false })
      timeoutId = setTimeout(poll, lastDelayMs)
    }
  }

  poll()

  return () => {
    cancelled = true
    if (timeoutId !== null) clearTimeout(timeoutId)
  }
}
