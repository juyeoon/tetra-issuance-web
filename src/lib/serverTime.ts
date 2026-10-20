// 현재 시각을 얻는 유일한 통로. 카운트다운, startAt 판정, endAt 판정이 모두 now()만 쓴다.
// 서버 시각 보정 로직은 이 파일에만 둔다. (CLAUDE.md §5.3)
// 보정값은 /event.json 응답의 Date, Age 헤더로 한 번 계산한다. 헤더 읽기는 src/api/의 getEventInfo가 하고
// syncServerTime으로 넘긴다. 화면 코드는 헤더를 다루지 않는다.

let offsetMs = 0

// offsetMs = (Date 헤더 시각 + Age 헤더 초 × 1000) − 응답을 받은 시점의 로컬 시각
// - Date가 없거나 파싱되지 않으면 보정하지 않는다(0).
// - Age가 없거나 숫자가 아니면 Age를 0으로 보고 Date만으로 보정한다(확정).
// event.json은 s-maxage=60으로 엣지에 캐시되므로 Date는 엣지가 캐시한 시점이고 Age가 0~60초까지 나올 수 있다.
// Date는 초 단위라 ±1초 오차는 허용한다.
export function computeOffset(dateHeader: string | null, ageHeader: string | null, receivedAt: number): number {
  if (dateHeader === null) return 0
  const dateMs = Date.parse(dateHeader)
  if (!Number.isFinite(dateMs)) return 0
  const age = ageHeader?.trim() ?? ''
  const ageSec = /^\d+$/.test(age) ? Number(age) : 0
  return dateMs + ageSec * 1000 - receivedAt
}

// 응답을 받은 직후에 부른다. 받은 시점은 여기서 잰다.
export function syncServerTime(dateHeader: string | null, ageHeader: string | null): void {
  offsetMs = computeOffset(dateHeader, ageHeader, Date.now())
}

// 보정하지 않은 브라우저 시각. 개발용 목이 "서버 시각"을 꾸밀 때만 쓴다. 화면은 now()를 쓴다.
export function deviceNow(): number {
  return Date.now()
}

export function now(): number {
  return Date.now() + offsetMs
}
