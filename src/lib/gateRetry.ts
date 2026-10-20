import { ApiError } from '../api/unwrapApiEnvelope'
import { config } from '../config'

// 엣지 게이트(CloudFront api-gate Function)의 "입장 준비 중" 503. KVS entryOpen이 false인 동안
// /api/* 요청에 본문 없는 503과 x-tetra-gate: entry-closed를 준다. (사용자 결정 2026-10-16)
export function isGateClosed(e: unknown): boolean {
  return e instanceof ApiError && e.status === 503 && e.gate === 'entry-closed'
}

// 게이트 503의 자동 재시도 대기 시간. Retry-After(없으면 config.gateRetryDefaultMs)를 기준으로
// 기준값 + 0~기준값 사이 무작위, 즉 기준값의 1~2배를 기다린다. 수만 명이 같은 순간에 다시 몰리지 않게 흩는다.
// random은 테스트용 주입 자리다. (사용자 결정 2026-10-16)
export function gateRetryDelayMs(retryAfterMs: number | null, random: number = Math.random()): number {
  const base = retryAfterMs !== null && retryAfterMs > 0 ? retryAfterMs : config.gateRetryDefaultMs
  return Math.round(base + base * random)
}

// 예외에서 Retry-After를 꺼내 대기 시간을 정한다.
export function gateRetryDelayFor(e: unknown, random?: number): number {
  return gateRetryDelayMs(e instanceof ApiError ? e.retryAfterMs : null, random)
}
