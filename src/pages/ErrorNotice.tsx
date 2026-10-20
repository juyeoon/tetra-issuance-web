import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { EventInfoContext } from '../hooks/useEventInfo'
import { autoRetryDelayMs, getErrorNotice } from '../lib/errors'
import ReturnToEventButton from './ReturnToEventButton'

// 에러 화면 공통 컴포넌트. 상황별 문구와 버튼만 바뀐다. 상황 판단은 lib/errors.ts. (CLAUDE.md §7.3)
// onRetry는 "같은 요청을 한 번 다시 보내는" 함수다. 없으면 새로고침한다.
export default function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { message, action } = getErrorNotice(error)
  // 자동 재시도 대기 시간은 에러마다 한 번만 정한다(게이트 503은 무작위 지터가 섞인다).
  const autoDelayMs = useMemo(() => autoRetryDelayMs(error), [error])
  const [busy, setBusy] = useState(false)
  // 돌아갈 주소는 이벤트 정보의 returnUrl이다. event.json 읽기 실패 화면처럼 이벤트 정보가 없거나
  // returnUrl이 safeReturnUrl을 통과하지 못하면 돌아갈 곳이 없어 버튼을 숨긴다. (확정)
  const returnUrl = useContext(EventInfoContext)?.returnUrl ?? ''
  const retryRef = useRef<() => void>(() => {})
  retryRef.current = onRetry ?? (() => window.location.reload())

  // 429 + Retry-After, 게이트 503(입장 준비 중)은 기다린 뒤 자동으로 한 번 다시 보낸다.
  // 다시 실패하면 새 에러 화면이 뜨고 같은 방식으로 또 기다린다.
  useEffect(() => {
    if (autoDelayMs === null) return
    const id = setTimeout(() => retryRef.current(), autoDelayMs)
    return () => clearTimeout(id)
  }, [autoDelayMs])

  // 연속으로 눌러도 요청이 겹치지 않게 첫 클릭 뒤에는 막는다. 요청이 다시 실패하면 새 에러 화면이 뜬다.
  function handleRetry() {
    if (busy) return
    setBusy(true)
    retryRef.current()
  }

  return (
    <div className="page page-center">
      <p>{message}</p>
      {action === 'retry' && (
        <button className="primary-button" disabled={busy} onClick={handleRetry}>
          다시 시도
        </button>
      )}
      {action === 'back' && <ReturnToEventButton returnUrl={returnUrl} />}
    </div>
  )
}
