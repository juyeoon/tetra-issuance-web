import { createContext, useContext } from 'react'
import type { EventInfo } from '../api'

// EventInfoGate가 읽은 이벤트 정보. 게이트 밖(NotFound, event.json 읽기 실패 화면)에서는 null이다.
export const EventInfoContext = createContext<EventInfo | null>(null)

// 02, 03, 04는 게이트 안에서만 그려지므로 항상 값이 있다. eventId는 여기서만 얻는다. (CLAUDE.md §5.1)
export function useEventInfo(): EventInfo {
  const info = useContext(EventInfoContext)
  if (info === null) throw new Error('useEventInfo는 EventInfoGate 안에서만 쓴다')
  return info
}
