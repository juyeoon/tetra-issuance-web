import { describe, expect, it } from 'vitest'
import { parseClaimResponse } from './parseClaimResponse'
import { ApiError } from './unwrapApiEnvelope'

const coupons = [
  { couponId: 1, name: '10% 할인 쿠폰', description: '전 상품 적용' },
  { couponId: 2, name: '무료배송 쿠폰', description: '2만원 이상 구매 시' },
]

describe('parseClaimResponse', () => {
  it('SUCCESS와 발급된 쿠폰 목록은 SUCCESS', () => {
    expect(parseClaimResponse({ result: 'SUCCESS', coupons })).toEqual({ result: 'SUCCESS' })
  })

  it('SOLD_OUT과 빈 목록은 SOLD_OUT(이름을 바꾸지 않는다)', () => {
    expect(parseClaimResponse({ result: 'SOLD_OUT', coupons: [] })).toEqual({ result: 'SOLD_OUT' })
  })

  it('DB 저장값 FAILED_SOLDOUT이나 모르는 result는 실패', () => {
    expect(() => parseClaimResponse({ result: 'FAILED_SOLDOUT', coupons: [] })).toThrow(ApiError)
    expect(() => parseClaimResponse({ result: 'success', coupons })).toThrow(ApiError)
    expect(() => parseClaimResponse({ coupons })).toThrow(ApiError)
  })

  it('coupons가 배열이 아니거나 항목 형식이 틀리면 실패', () => {
    expect(() => parseClaimResponse({ result: 'SUCCESS' })).toThrow(ApiError)
    expect(() => parseClaimResponse({ result: 'SUCCESS', coupons: null })).toThrow(ApiError)
    expect(() => parseClaimResponse({ result: 'SUCCESS', coupons: [{ couponId: '1', name: 'a', description: 'b' }] })).toThrow(
      ApiError,
    )
    expect(() => parseClaimResponse({ result: 'SUCCESS', coupons: [{ couponId: 1, name: 'a' }] })).toThrow(ApiError)
  })

  it('봉투를 벗기지 않은 값이나 객체가 아닌 값은 실패', () => {
    expect(() => parseClaimResponse({ success: true, data: { result: 'SUCCESS', coupons } })).toThrow(ApiError)
    expect(() => parseClaimResponse(null)).toThrow(ApiError)
    expect(() => parseClaimResponse([])).toThrow(ApiError)
  })
})
