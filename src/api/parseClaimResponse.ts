import { ApiError } from './unwrapApiEnvelope'

// claim 결과. 서버 응답 값(SUCCESS / SOLD_OUT)을 그대로 쓴다. FAILED_SOLDOUT은 DB 저장값이라 화면 타입에 두지 않는다. (CLAUDE.md §7)
export type ClaimResult = 'SUCCESS' | 'SOLD_OUT'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isClaimedCoupon(v: unknown): boolean {
  return (
    isRecord(v) &&
    typeof v.couponId === 'number' &&
    Number.isFinite(v.couponId) &&
    typeof v.name === 'string' &&
    typeof v.description === 'string'
  )
}

// claim 응답 봉투의 data를 검증한다. { result: 'SUCCESS', coupons: [{ couponId, name, description }, ...] }
// 또는 { result: 'SOLD_OUT', coupons: [] }이다(품절도 HTTP 200). 같은 사용자가 다시 보내면 처음 결과가 그대로 온다.
// 형식이 틀리면 ApiError(상태 코드 없음)로 던지고, 화면은 이를 "응답을 못 받음"과 같은 연결 오류로 본다.
// 화면은 발급된 쿠폰 목록을 쓰지 않으므로 result만 돌려준다.
export function parseClaimResponse(data: unknown): { result: ClaimResult } {
  if (isRecord(data) && Array.isArray(data.coupons) && data.coupons.every(isClaimedCoupon)) {
    if (data.result === 'SUCCESS' || data.result === 'SOLD_OUT') return { result: data.result }
  }
  throw new ApiError('쿠폰 발급 응답 형식 오류')
}
