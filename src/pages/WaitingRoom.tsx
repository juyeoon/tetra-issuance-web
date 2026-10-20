import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { config } from '../config'
import { useEventInfo } from '../hooks/useEventInfo'
import { messageFor } from '../lib/errors'
import { formatKstHHmm } from '../lib/kst'
import { now } from '../lib/serverTime'
import { entryNoticeOf, isEntryPendingRedirect, waitingRoomPhase } from '../lib/waitingRoom'
import ReturnToEventButton from './ReturnToEventButton'

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// 02 대기방. 구성과 위치는 모든 이벤트에서 고정이다(layout의 위치를 쓰지 않는다). (CLAUDE.md §4)
// 02의 카운트다운/지터 코드는 03의 폴링 코드와 완전히 별개다.
// 시각 판정은 모두 보정된 now()로 한다. event.json의 시각은 parseEventInfo가 +09:00 형식으로 검증했다.
export default function WaitingRoom() {
  const navigate = useNavigate()
  const eventInfo = useEventInfo()
  const entryOpenAtMs = new Date(eventInfo.entryOpenAt).getTime()
  const startAtMs = new Date(eventInfo.startAt).getTime()
  const endAtMs = new Date(eventInfo.endAt).getTime()

  // 처음 열었을 때 한 번만 판정하고, 화면을 띄워 둔 채 entryOpenAt이 지나도 바꾸지 않는다(세션은 재진입해야 생긴다).
  const [entryNotice] = useState(() =>
    entryNoticeOf(now(), entryOpenAtMs, endAtMs, isEntryPendingRedirect(window.location.search)),
  )
  const [nowMs, setNowMs] = useState(() => now())
  const [joining, setJoining] = useState(false)

  // 카운트다운, 시작, 종료를 같은 주기로 확인한다.
  useEffect(() => {
    if (entryNotice !== null) return
    const intervalId = setInterval(() => setNowMs(now()), 250)
    return () => clearInterval(intervalId)
  }, [entryNotice])

  const banner = eventInfo.bannerUrl !== '' && <img className="banner" src={eventInfo.bannerUrl} alt="" />

  // 세션 없이 들어온 사용자. 첫 JWT는 1회용이라 새로고침으로는 세션이 생기지 않으므로
  // 카운트다운과 입장 버튼 대신 안내와 이벤트 페이지로 돌아가는 버튼만 보여 준다.
  // beforeOpen은 입장 OPEN 시각 전, preparing은 시각이 지났지만 엣지 게이트가 아직 입장을 열지 않은 경우다.
  if (entryNotice !== null) {
    return (
      <div className="page page-center">
        {banner}
        <p className="notice">
          {entryNotice === 'beforeOpen'
            ? `입장은 ${formatKstHHmm(entryOpenAtMs)}부터 가능합니다. 그 이후 이벤트 페이지에서 다시 들어와 주세요.`
            : '입장을 준비하고 있어요. 이벤트 페이지에서 다시 들어와 주세요.'}
        </p>
        <ReturnToEventButton returnUrl={eventInfo.returnUrl} />
      </div>
    )
  }

  const phase = waitingRoomPhase(nowMs, startAtMs, endAtMs)

  // 종료된 이벤트. 입장 버튼 대신 종료 안내를 보여 준다(문구는 errors.ts). 최종 판정은 서버다.
  if (phase === 'ended') {
    return (
      <div className="page page-center">
        {banner}
        <p className="notice">{messageFor('ended')}</p>
      </div>
    )
  }

  const started = phase === 'open'

  function handleClick() {
    if (!started || joining) return
    setJoining(true)
    const delay = Math.random() * config.jitterMaxMs
    setTimeout(() => {
      // 쿼리(개발용 목 옵션 등)를 다음 화면에도 그대로 넘긴다. replace로 이동해 방문 기록에 앱 화면을 한 칸만 둔다.
      // 그래서 03, 04에서 뒤로가기를 누르면 02가 아니라 앞 페이지(테넌트 페이지)로 나간다. (CLAUDE.md §3)
      navigate(`/queue${window.location.search}`, { replace: true })
    }, delay)
  }

  return (
    <div className="page page-center">
      {banner}
      <h1>{started ? '이벤트가 시작되었습니다!' : '이벤트 시작까지 기다려주세요'}</h1>
      <div className="countdown">{formatCountdown(startAtMs - nowMs)}</div>
      <div className="caption">이벤트 시작까지 남은 시간</div>
      <button className="primary-button" disabled={!started || joining} onClick={handleClick}>
        {joining ? '이동 중...' : '쿠폰 받으러 가기'}
      </button>
    </div>
  )
}
