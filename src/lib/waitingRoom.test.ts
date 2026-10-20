import { describe, expect, it } from 'vitest'
import { entryNoticeOf, isBeforeEntryOpen, isEntryPendingRedirect, waitingRoomPhase } from './waitingRoom'

const ENTRY_OPEN = 1_000_000
const START = ENTRY_OPEN + 60 * 60 * 1000
const END = START + 2 * 60 * 60 * 1000

describe('isBeforeEntryOpen', () => {
  it('entryOpenAt 전이면 true, 같거나 지나면 false', () => {
    expect(isBeforeEntryOpen(ENTRY_OPEN - 1, ENTRY_OPEN)).toBe(true)
    expect(isBeforeEntryOpen(ENTRY_OPEN, ENTRY_OPEN)).toBe(false)
    expect(isBeforeEntryOpen(ENTRY_OPEN + 1, ENTRY_OPEN)).toBe(false)
  })
})

describe('waitingRoomPhase', () => {
  it('startAt 전은 카운트다운', () => {
    expect(waitingRoomPhase(START - 1, START, END)).toBe('countdown')
  })

  it('startAt부터 endAt 전까지는 버튼 활성', () => {
    expect(waitingRoomPhase(START, START, END)).toBe('open')
    expect(waitingRoomPhase(END - 1, START, END)).toBe('open')
  })

  it('endAt부터는 종료 안내', () => {
    expect(waitingRoomPhase(END, START, END)).toBe('ended')
    expect(waitingRoomPhase(END + 1, START, END)).toBe('ended')
  })
})

describe('isEntryPendingRedirect', () => {
  it('entry=pending일 때만 true', () => {
    expect(isEntryPendingRedirect('?entry=pending')).toBe(true)
    expect(isEntryPendingRedirect('?mockApi=1&entry=pending')).toBe(true)
    expect(isEntryPendingRedirect('')).toBe(false)
    expect(isEntryPendingRedirect('?entry=PENDING')).toBe(false)
    expect(isEntryPendingRedirect('?entry=')).toBe(false)
    expect(isEntryPendingRedirect('?entry=open')).toBe(false)
  })
})

describe('entryNoticeOf (게이트 302 포함)', () => {
  it('entryOpenAt 전이면 302로 왔든 아니든 "입장은 HH:mm부터" 안내', () => {
    expect(entryNoticeOf(ENTRY_OPEN - 1, ENTRY_OPEN, END, false)).toBe('beforeOpen')
    expect(entryNoticeOf(ENTRY_OPEN - 1, ENTRY_OPEN, END, true)).toBe('beforeOpen')
  })

  it('entryOpenAt 후 게이트 302로 왔으면 준비 중 안내', () => {
    expect(entryNoticeOf(ENTRY_OPEN, ENTRY_OPEN, END, true)).toBe('preparing')
    expect(entryNoticeOf(START + 1, ENTRY_OPEN, END, true)).toBe('preparing')
  })

  it('entryOpenAt 후 일반 진입이면 안내 없음', () => {
    expect(entryNoticeOf(ENTRY_OPEN, ENTRY_OPEN, END, false)).toBeNull()
  })

  it('종료 뒤에는 302로 왔어도 준비 중이 아니라 종료 판정에 맡긴다', () => {
    expect(entryNoticeOf(END, ENTRY_OPEN, END, true)).toBeNull()
  })
})
