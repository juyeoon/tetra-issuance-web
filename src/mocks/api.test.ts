import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimCoupons, getCoupons, getQueueCursor, requestTicket } from '../api'
import { getErrorNotice } from '../lib/errors'
import { mockApiResponse } from './api'

// 개발 빌드(vitest는 import.meta.env.DEV가 true)에서 목 쿼리가 실제 API 함수와 에러 분류를 그대로 타는지 본다.
function withSearch(search: string) {
  vi.stubGlobal('window', { location: { search } })
  const fn = vi.fn(async () => new Response('', { status: 599 }))
  vi.stubGlobal('fetch', fn)
  return fn
}

async function noticeFor(call: () => Promise<unknown>) {
  try {
    await call()
  } catch (e) {
    return getErrorNotice(e)
  }
  throw new Error('예외가 던져지지 않음')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('?mockApi=1', () => {
  it('번호표, 쿠폰 목록, claim, 커서를 fetch 없이 목으로 응답한다', async () => {
    const fn = withSearch('?mockApi=1')
    await expect(requestTicket(1)).resolves.toEqual({ ticket: 100 })
    const coupons = await getCoupons(1)
    expect(coupons.map((c) => c.name)).toEqual(['10% 할인 쿠폰', '무료배송 쿠폰', '2,000원 할인 쿠폰'])
    await expect(claimCoupons(1)).resolves.toHaveProperty('result')
    await expect(getQueueCursor(1)).resolves.toHaveProperty('cursor')
    expect(fn).not.toHaveBeenCalled()
  })

  it('?ticket=, ?cursorPerSec=로 번호와 커서 속도를 바꾼다', async () => {
    vi.useFakeTimers()
    withSearch('?mockApi=1&ticket=7&cursorPerSec=100')
    const ticket = requestTicket(1)
    await vi.advanceTimersByTimeAsync(200)
    await expect(ticket).resolves.toEqual({ ticket: 7 })
    const first = getQueueCursor(1)
    await vi.advanceTimersByTimeAsync(200)
    const second = getQueueCursor(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect((await second).cursor - (await first).cursor).toBeGreaterThanOrEqual(19)
  })

  it('claim 결과는 서버 값 SUCCESS / SOLD_OUT 그대로 온다', async () => {
    withSearch('?mockApi=1')
    await expect(claimCoupons(1)).resolves.toEqual({ result: 'SUCCESS' })
    withSearch('?mockApi=1&claimResult=SOLD_OUT')
    await expect(claimCoupons(1)).resolves.toEqual({ result: 'SOLD_OUT' })
  })

  it('?claimResult=에 틀린 값을 주면 claim 응답 검증에서 걸러진다', async () => {
    withSearch('?mockApi=1&claimResult=WHATEVER')
    expect((await noticeFor(() => claimCoupons(1))).situation).toBe('network')
  })

  it('목 쿼리가 없으면 실제 fetch를 쓴다', async () => {
    const fn = withSearch('')
    await noticeFor(() => requestTicket(1))
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('?apiError=', () => {
  it('SESSION_NOT_FOUND면 번호표, 쿠폰 목록, claim이 401 → 입장 정보 만료 + 돌아가기', async () => {
    const fn = withSearch('?apiError=SESSION_NOT_FOUND')
    for (const call of [() => requestTicket(1), () => getCoupons(1), () => claimCoupons(1)]) {
      const n = await noticeFor(call)
      expect(n.situation).toBe('sessionExpired')
      expect(n.message).toBe('입장 정보가 만료되었어요. 이벤트 페이지에서 다시 입장해 주세요')
      expect(n.action).toBe('back')
    }
    expect(fn).not.toHaveBeenCalled()
  })

  it('번호표 요청이 409 ALREADY_CLAIMED면 "이미 참여한 이벤트입니다." 화면(버튼 없음)', async () => {
    withSearch('?apiError=ALREADY_CLAIMED')
    const n = await noticeFor(() => requestTicket(1))
    expect(n.situation).toBe('alreadyClaimed')
    expect(n.message).toBe('이미 참여한 이벤트입니다.')
    expect(n.action).toBe('none')
  })

  it('커서는 영향받지 않는다(인증 없음)', () => {
    expect(mockApiResponse('/api/issuance/events/1/queue/cursor', 'GET', '?apiError=SESSION_NOT_FOUND')).toBeNull()
  })
})

describe('?notStartedFor=', () => {
  it('첫 요청부터 n초 동안 번호표가 409 EVENT_NOT_STARTED, 그 뒤에는 번호를 준다', async () => {
    vi.useFakeTimers()
    withSearch('?mockApi=1&notStartedFor=2')
    const first = noticeFor(() => requestTicket(1))
    await vi.advanceTimersByTimeAsync(200)
    expect((await first).situation).toBe('notStarted')

    await vi.advanceTimersByTimeAsync(2000)
    const second = requestTicket(1)
    await vi.advanceTimersByTimeAsync(200)
    await expect(second).resolves.toEqual({ ticket: 100 })
  })
})

describe('mockApiResponse 경로 판별', () => {
  it('API 경로와 메서드가 맞을 때만 목으로 응답한다', () => {
    expect(mockApiResponse('/api/issuance/events/1/ticket', 'GET', '?mockApi=1')).toBeNull()
    expect(mockApiResponse('/api/issuance/events/1/info', 'GET', '?mockApi=1')).toBeNull()
    expect(mockApiResponse('/api/issuance/events/1/coupons', 'GET', '?mockApi=1')).not.toBeNull()
  })
})
