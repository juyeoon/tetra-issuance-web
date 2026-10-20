import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { getEventInfo, type EventInfo } from '../api'
import { EventInfoContext } from '../hooks/useEventInfo'
import { themeClassOf } from '../lib/layout'
import ErrorNotice from './ErrorNotice'

// 02, 03, 04의 공통 바깥 틀. 이벤트 정보(/event.json)를 먼저 읽고, 받은 뒤에만 화면을 그린다.
// eventId는 이 결과에서만 얻으므로 이벤트 정보를 받기 전에는 다른 API를 부르지 않는다. (CLAUDE.md §5.1)
// 스토리지에 저장하지 않으므로 /queue나 /issue에서 새로고침하면 다시 읽는다. 화면 사이 이동에서는 다시 읽지 않는다.
// 읽기나 검증에 실패하면 에러 화면을 보여 주고, 다시 시도는 event.json을 한 번 다시 읽는다.
// 테마는 이 앱 루트 요소의 클래스 하나로 적용한다(02, 03, 04, 모달 공통). 로딩과 읽기 실패 화면은 :root 기본값(WHITE)이다.
export default function EventInfoGate() {
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getEventInfo().then(
      (info) => {
        if (!cancelled) setEventInfo(info)
      },
      (e) => {
        if (!cancelled) setError(e ?? new Error('이벤트 정보 요청 실패'))
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (error !== null) {
    return (
      <ErrorNotice
        error={error}
        onRetry={() => {
          setError(null)
          setAttempt((a) => a + 1)
        }}
      />
    )
  }

  if (!eventInfo) {
    return <div className="page page-center">불러오는 중...</div>
  }

  return (
    <EventInfoContext.Provider value={eventInfo}>
      <div className={`app-root ${themeClassOf(eventInfo.layout.theme)}`}>
        <Outlet />
      </div>
    </EventInfoContext.Provider>
  )
}
