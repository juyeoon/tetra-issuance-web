// 02 대기방의 상태 판정. 시각은 모두 보정된 now()(serverTime.ts)로 넘긴다. (CLAUDE.md §4)

// 02를 처음 열었을 때 한 번만 판정한다. 입장 OPEN 전에 들어온 사용자는 세션이 없으므로,
// 화면을 띄워 둔 채 entryOpenAt이 지나도 안내를 유지한다(세션은 이벤트 페이지에서 재진입해야 생긴다).
export function isBeforeEntryOpen(nowMs: number, entryOpenAtMs: number): boolean {
  return nowMs < entryOpenAtMs
}

// 엣지 게이트는 입장 준비 전(KVS entryOpen=false)에 세션 발급 요청을 받으면 JWT를 버리고 /?entry=pending으로 302를 보낸다.
// 운영 빌드에서도 읽는 유일한 쿼리다. 값이 정확히 pending일 때만 인정한다. (CLAUDE.md §9 예외, 사용자 결정 2026-10-16)
export function isEntryPendingRedirect(search: string): boolean {
  return new URLSearchParams(search).get('entry') === 'pending'
}

// 02를 처음 열었을 때 입장 버튼 대신 보여 줄 안내.
// - beforeOpen: 입장 OPEN 시각(entryOpenAt) 전. 게이트 302로 왔든 아니든 "입장은 HH:mm부터" 안내다.
// - preparing: 시각은 지났지만 게이트가 아직 입장을 열지 않아 302로 돌아왔다(세션 없음). 다시 들어오라고 안내한다.
//   이미 종료(endAt 이후)됐으면 준비 중이 아니라 종료 안내가 맞으므로 null로 두고 종료 판정에 맡긴다.
// - null: 안내 없이 카운트다운과 입장 버튼(또는 종료 안내).
export type EntryNotice = 'beforeOpen' | 'preparing' | null

export function entryNoticeOf(
  nowMs: number,
  entryOpenAtMs: number,
  endAtMs: number,
  entryPendingRedirect: boolean,
): EntryNotice {
  if (isBeforeEntryOpen(nowMs, entryOpenAtMs)) return 'beforeOpen'
  if (entryPendingRedirect && nowMs < endAtMs) return 'preparing'
  return null
}

// countdown: 시작 전(카운트다운 + 비활성 버튼), open: 시작 후(활성 버튼), ended: 종료 안내.
// 입장 버튼 활성화 기준은 startAt이다(entryOpenAt이 아니다). 종료 판정은 안내용이고 최종 판정은 서버다(409 EVENT_ENDED).
export type WaitingRoomPhase = 'countdown' | 'open' | 'ended'

export function waitingRoomPhase(nowMs: number, startAtMs: number, endAtMs: number): WaitingRoomPhase {
  if (nowMs >= endAtMs) return 'ended'
  if (nowMs >= startAtMs) return 'open'
  return 'countdown'
}
