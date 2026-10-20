import { ELEMENT_KEYS, H_VALUES, V_VALUES, type ElementKey, type H, type Layout, type Pos, type Theme } from '../api/parseEventInfo'

// event.json의 layout 값 → 그리드 위치·클래스 이름 변환은 이 파일에만 둔다. (CLAUDE.md §6.4)
// React와 DOM에 의존하지 않는 순수 함수로 둔다(Portal 미리보기가 나중에 재사용할 수 있게).
// 클래스 이름은 parseEventInfo 검증을 통과한 열거값으로만 만든다. event.json의 문자열을 그대로 넣지 않는다.

export type Cell = { row: 1 | 2 | 3; col: 1 | 2 | 3 }

// v는 행(TOP, MIDDLE, BOTTOM), h는 열(LEFT, CENTER, RIGHT)이다.
export function cellOf(pos: Pos): Cell {
  return {
    row: (V_VALUES.indexOf(pos.v) + 1) as Cell['row'],
    col: (H_VALUES.indexOf(pos.h) + 1) as Cell['col'],
  }
}

function cellKey(cell: Cell): string {
  return `${cell.row}-${cell.col}`
}

// 요소를 칸별로 묶는다. 키는 "행-열"이고, 칸 안의 요소는 고정 순서(제목 → 배너 → 쿠폰 목록 → 발급 버튼)다(확정).
// 칸은 행, 열 순으로 넣는다. 요소가 없는 칸은 넣지 않는다.
export function groupByCell(layout: Layout): Map<string, ElementKey[]> {
  const byKey = new Map<string, ElementKey[]>()
  for (const key of ELEMENT_KEYS) {
    const k = cellKey(cellOf(layout[key]))
    byKey.set(k, [...(byKey.get(k) ?? []), key])
  }
  const sorted = [...byKey.keys()].sort()
  return new Map(sorted.map((k) => [k, byKey.get(k)!]))
}

// 04는 요소를 한 열로 쌓는다(CLAUDE.md §6.1, 사용자 결정). 순서는 v 순서(TOP → MIDDLE → BOTTOM)가 먼저이고,
// 같은 v 안에서는 고정 순서다. h는 순서에 영향이 없고 가로 정렬로만 쓴다. 빈 행은 접는다.
export function stackOrder(layout: Layout): ElementKey[] {
  return ELEMENT_KEYS.map((key, index) => ({ key, rank: cellOf(layout[key]).row * ELEMENT_KEYS.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ key }) => key)
}

const ALIGN_CLASS: Record<H, string> = {
  LEFT: 'layout-align-left',
  CENTER: 'layout-align-center',
  RIGHT: 'layout-align-right',
}

// 요소는 h에 맞춰 가로로 정렬한다.
export function alignClassOf(h: H): string {
  return ALIGN_CLASS[h]
}

const THEME_CLASS: Record<Theme, string> = {
  WHITE: 'theme-WHITE',
  WARM_ORANGE: 'theme-WARM_ORANGE',
  DARK: 'theme-DARK',
  BLUE: 'theme-BLUE',
}

// 테마는 앱 루트 요소의 클래스 하나로 바꾼다. 색은 CSS 변수로만 정의한다. (CLAUDE.md §6.3)
export function themeClassOf(theme: Theme): string {
  return THEME_CLASS[theme]
}
