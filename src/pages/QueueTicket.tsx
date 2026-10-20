import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestTicket } from '../api'
import { useEventInfo } from '../hooks/useEventInfo'
import { useQueuePolling } from '../hooks/useQueuePolling'
import { gateRetryDelayFor, isGateClosed } from '../lib/gateRetry'
import ErrorNotice from './ErrorNotice'

// 03 번호표. 새로고침하면 새 번호를 받으므로 myTicketNumber는 어떤 스토리지에도 저장하지 않는다. (CLAUDE.md §4)
export default function QueueTicket() {
  const navigate = useNavigate()
  const { eventId } = useEventInfo()
  const [myTicketNumber, setMyTicketNumber] = useState<number | null>(null)
  const [ticketError, setTicketError] = useState<unknown>(null)
  const [ticketAttempt, setTicketAttempt] = useState(0)
  // 번호표 요청이 엣지 게이트의 503(입장 준비 중)을 받았다. 에러 화면 대신 이 화면을 유지하고 자동으로 다시 요청한다.
  const [ticketPreparing, setTicketPreparing] = useState(false)

  useEffect(() => {
    let cancelled = false
    let retryId: ReturnType<typeof setTimeout> | null = null
    requestTicket(eventId).then(
      (res) => {
        if (cancelled) return
        setTicketPreparing(false)
        setMyTicketNumber(res.ticket)
      },
      (e) => {
        if (cancelled) return
        if (isGateClosed(e)) {
          // Retry-After의 1~2배를 기다린 뒤 같은 요청을 다시 보낸다. (사용자 결정 2026-10-16)
          setTicketPreparing(true)
          retryId = setTimeout(() => setTicketAttempt((a) => a + 1), gateRetryDelayFor(e))
          return
        }
        setTicketPreparing(false)
        setTicketError(e ?? new Error('번호표 요청 실패'))
      },
    )
    return () => {
      cancelled = true
      if (retryId !== null) clearTimeout(retryId)
    }
  }, [eventId, ticketAttempt])

  const { gap, delayed, preparing, failed, error: pollingError, restart } = useQueuePolling(eventId, myTicketNumber)

  useEffect(() => {
    if (gap !== null && gap <= 0) {
      // 쿼리(개발용 목 옵션 등)를 다음 화면에도 그대로 넘긴다. replace라서 뒤로가기는 테넌트 페이지로 간다. (CLAUDE.md §3)
      navigate(`/issue${window.location.search}`, { replace: true })
    }
  }, [gap, navigate])

  // 번호표 요청 실패, 폴링 실패가 15초 이상 이어진 경우의 에러 UI (CLAUDE.md §8). 다시 시도는 같은 요청을 한 번 다시 보낸다.
  if (ticketError !== null) {
    return (
      <ErrorNotice
        error={ticketError}
        onRetry={() => {
          setTicketError(null)
          setTicketAttempt((a) => a + 1)
        }}
      />
    )
  }
  if (failed) {
    return <ErrorNotice error={pollingError} onRetry={restart} />
  }

  const waitingCount = gap !== null ? Math.max(0, gap) : null

  return (
    <div className="page page-center">
      <div className="spinner" aria-hidden />
      <h1>잠시만 기다려 주세요</h1>
      <div className="caption">
        많은 분들이 접속 중입니다
        <br />
        새로고침하지 않아도 자동으로 이동합니다
      </div>
      <div className="waiting-box">
        <div className="caption">현재 대기자 수</div>
        <div className="waiting-count">
          {waitingCount === null ? '-' : waitingCount.toLocaleString('ko-KR')}명
        </div>
        {/* 폴링 실패가 15초 전이면 대기열 화면을 유지하고 지연 표시만 띄운다. 마지막 순번은 그대로 둔다. */}
        {delayed && <div className="caption">연결이 지연되고 있어요</div>}
        {/* 엣지 게이트가 입장 준비 중이라고 답하면 화면을 유지한 채 자동으로 다시 묻는다. */}
        {(ticketPreparing || preparing) && <div className="caption">입장을 준비하고 있어요</div>}
      </div>
    </div>
  )
}
