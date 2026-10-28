// 현재 시각을 얻는 유일한 통로. 카운트다운, startAt 판정, endAt 판정이 모두 now()만 쓴다.
// 서버 시각 보정 로직은 이 파일에만 둔다. (CLAUDE.md §5.3)
// 보정값은 캐시되지 않는 시간 응답(GET /api/issuance/time, api-gate CloudFront Function이 바로 답함)으로 정한다.
// 시간 응답을 못 받으면 /event.json 응답의 Date 헤더만 쓴다. 요청과 헤더 읽기는 src/api/가 하고 결과만 여기로 넘긴다.
// 화면 코드는 헤더나 시간 응답을 다루지 않는다.

let offsetMs = 0

// 시간 응답 표본 하나로 보정값을 구한다. 서버가 응답을 만든 시점을 왕복의 가운데로 보고,
// 받은 시점의 서버 시각 = serverMs + 왕복의 절반으로 추정한다.
export function offsetFromSample(serverMs: number, sentAt: number, receivedAt: number): number {
  const rttMs = Math.max(0, receivedAt - sentAt)
  return serverMs + rttMs / 2 - receivedAt
}

// 시간 응답을 못 받았을 때 쓰는 대체 보정값. /event.json의 Date만 쓰고 Age는 더하지 않는다.
// 엣지 캐시 응답의 Date가 보낸 시각으로 오는데 Age까지 더하면 캐시된 시간(0~60초)만큼 지금 시각이 앞서 간다
// (dev 이벤트 12, 2026-10-28: 카운트다운이 최대 1분 이상 일찍 끝남). Date가 없거나 파싱되지 않으면 보정하지 않는다(0).
// Date는 초 단위라 ±1초 오차는 허용한다.
export function offsetFromDateHeader(dateHeader: string | null, receivedAt: number): number {
  if (dateHeader === null) return 0
  const dateMs = Date.parse(dateHeader)
  return Number.isFinite(dateMs) ? dateMs - receivedAt : 0
}

// src/api/가 정한 보정값을 넣는다.
export function setServerOffset(ms: number): void {
  offsetMs = ms
}

// 보정하지 않은 브라우저 시각. 왕복 시간을 재거나 개발용 목이 "서버 시각"을 꾸밀 때만 쓴다. 화면은 now()를 쓴다.
export function deviceNow(): number {
  return Date.now()
}

export function now(): number {
  return Date.now() + offsetMs
}
