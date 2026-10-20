import { describe, expect, it } from 'vitest'
import type { Layout } from '../api/parseEventInfo'
import { alignClassOf, cellOf, groupByCell, stackOrder, themeClassOf } from './layout'

const base: Layout = {
  title: { h: 'CENTER', v: 'TOP' },
  banner: { h: 'CENTER', v: 'TOP' },
  couponList: { h: 'CENTER', v: 'MIDDLE' },
  issueButton: { h: 'CENTER', v: 'BOTTOM' },
  theme: 'WHITE',
}

describe('cellOf', () => {
  it('v는 행, h는 열이다(9칸 모두)', () => {
    expect(cellOf({ h: 'LEFT', v: 'TOP' })).toEqual({ row: 1, col: 1 })
    expect(cellOf({ h: 'CENTER', v: 'TOP' })).toEqual({ row: 1, col: 2 })
    expect(cellOf({ h: 'RIGHT', v: 'TOP' })).toEqual({ row: 1, col: 3 })
    expect(cellOf({ h: 'LEFT', v: 'MIDDLE' })).toEqual({ row: 2, col: 1 })
    expect(cellOf({ h: 'CENTER', v: 'MIDDLE' })).toEqual({ row: 2, col: 2 })
    expect(cellOf({ h: 'RIGHT', v: 'MIDDLE' })).toEqual({ row: 2, col: 3 })
    expect(cellOf({ h: 'LEFT', v: 'BOTTOM' })).toEqual({ row: 3, col: 1 })
    expect(cellOf({ h: 'CENTER', v: 'BOTTOM' })).toEqual({ row: 3, col: 2 })
    expect(cellOf({ h: 'RIGHT', v: 'BOTTOM' })).toEqual({ row: 3, col: 3 })
  })
})

describe('groupByCell', () => {
  it('같은 칸의 요소는 고정 순서(제목 → 배너 → 쿠폰 목록 → 발급 버튼)로 묶는다', () => {
    expect([...groupByCell(base)]).toEqual([
      ['1-2', ['title', 'banner']],
      ['2-2', ['couponList']],
      ['3-2', ['issueButton']],
    ])
  })

  it('4개가 모두 한 칸이어도 고정 순서다', () => {
    const allBottomRight: Layout = {
      title: { h: 'RIGHT', v: 'BOTTOM' },
      banner: { h: 'RIGHT', v: 'BOTTOM' },
      couponList: { h: 'RIGHT', v: 'BOTTOM' },
      issueButton: { h: 'RIGHT', v: 'BOTTOM' },
      theme: 'DARK',
    }
    expect([...groupByCell(allBottomRight)]).toEqual([['3-3', ['title', 'banner', 'couponList', 'issueButton']]])
  })

  it('layout의 키 순서와 상관없이 고정 순서이고, 칸은 행·열 순서다', () => {
    const shuffled: Layout = {
      issueButton: { h: 'LEFT', v: 'TOP' },
      couponList: { h: 'LEFT', v: 'TOP' },
      theme: 'BLUE',
      banner: { h: 'RIGHT', v: 'BOTTOM' },
      title: { h: 'RIGHT', v: 'TOP' },
    }
    expect([...groupByCell(shuffled)]).toEqual([
      ['1-1', ['couponList', 'issueButton']],
      ['1-3', ['title']],
      ['3-3', ['banner']],
    ])
  })
})

describe('stackOrder (04 한 열 쌓기)', () => {
  it('기본 배치는 제목 → 배너 → 쿠폰 목록 → 발급 버튼', () => {
    expect(stackOrder(base)).toEqual(['title', 'banner', 'couponList', 'issueButton'])
  })

  it('v 순서가 먼저이고, 같은 v에서는 h와 상관없이 고정 순서다', () => {
    const layout: Layout = {
      title: { h: 'RIGHT', v: 'BOTTOM' },
      banner: { h: 'RIGHT', v: 'TOP' },
      couponList: { h: 'LEFT', v: 'TOP' },
      issueButton: { h: 'CENTER', v: 'MIDDLE' },
      theme: 'WHITE',
    }
    expect(stackOrder(layout)).toEqual(['banner', 'couponList', 'issueButton', 'title'])
  })

  it('버튼을 TOP, 제목을 BOTTOM에 두면 배너 → 버튼 → 쿠폰 목록 → 제목', () => {
    const layout: Layout = { ...base, issueButton: { h: 'LEFT', v: 'TOP' }, title: { h: 'RIGHT', v: 'BOTTOM' } }
    expect(stackOrder(layout)).toEqual(['banner', 'issueButton', 'couponList', 'title'])
  })
})

describe('클래스 이름', () => {
  it('검증된 열거값에서만 만든다', () => {
    expect(alignClassOf('RIGHT')).toBe('layout-align-right')
    expect(themeClassOf('WARM_ORANGE')).toBe('theme-WARM_ORANGE')
  })
})
