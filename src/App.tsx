import { BrowserRouter, Route, Routes } from 'react-router-dom'
import EventInfoGate from './pages/EventInfoGate'
import WaitingRoom from './pages/WaitingRoom'
import QueueTicket from './pages/QueueTicket'
import CouponIssuance from './pages/CouponIssuance'
import NotFound from './pages/NotFound'

// history 방식 라우팅. 해시 라우팅은 쓰지 않는다 (CLAUDE.md §3).
// 02, 03, 04는 이벤트 정보(/event.json)를 먼저 읽는 EventInfoGate 안에 둔다. NotFound는 event.json 없이 바로 그린다.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<EventInfoGate />}>
          <Route path="/" element={<WaitingRoom />} />
          <Route path="/queue" element={<QueueTicket />} />
          <Route path="/issue" element={<CouponIssuance />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
