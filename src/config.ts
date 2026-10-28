export const config = {
  // 지터 상한. 02 화면에서 버튼을 누른 뒤 0~이 값(ms) 사이로 대기한다. (CLAUDE.md §4, §9 확정값)
  jitterMaxMs: 1000,

  // 폴링 실패가 이 시간(ms) 이상 이어질 때만 전체 에러 UI를 띄운다. 성공 응답이 한 번이라도 오면 초기화.
  // CloudFront가 만든 502/504가 엣지에 10초 캐시되기 때문이다. (CLAUDE.md §8, 확정)
  pollingFailureLimitMs: 15000,

  // 엣지 게이트의 503(입장 준비 중)에 Retry-After가 없거나 해석되지 않을 때 쓰는 기본 대기 시간(ms).
  // 실제 대기는 이 값(또는 Retry-After)의 1~2배 사이 무작위다(lib/gateRetry.ts). (사용자 결정 2026-10-16)
  gateRetryDefaultMs: 10000,

  // 서버 시각 보정용 시간 응답(GET /api/issuance/time) 표본 수와 표본 하나의 제한 시간(ms).
  // 표본 중 왕복이 가장 짧은 것을 쓴다. 첫 표본이 실패하면 더 묻지 않고 event.json의 Date로 대체한다. (CLAUDE.md §5.3)
  serverTimeSamples: 3,
  serverTimeTimeoutMs: 1500,
};

// 개발 빌드에서만 쓰는 값. 목(src/mocks/)만 참조하므로 운영 번들에서 빠진다. (CLAUDE.md §9)
// 운영에서 eventId는 /event.json에서만 얻는다.
export const devConfig = {
  // 개발용 목 event.json의 eventId. ?event=<id>가 없을 때 쓴다(DB 시드의 event_id).
  defaultEventId: 1,
};
