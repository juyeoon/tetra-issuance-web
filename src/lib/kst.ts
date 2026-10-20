// 일시는 KST(+09:00)로 해석하고 표기한다. 브라우저의 로컬 시간대에 의존하지 않는다. (CLAUDE.md §10)
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

// event.json의 시각 형식. 초까지 쓰고 소수점 초는 없으며 오프셋은 +09:00만 쓴다(생성 가이드, 확정).
const KST_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/

// epochMs 시점을 KST 벽시계 기준 `YYYY-MM-DDTHH:mm:ss+09:00`으로 표기한다.
export function toKstIsoString(epochMs: number): string {
  const kst = new Date(epochMs + KST_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  const yyyy = String(kst.getUTCFullYear()).padStart(4, '0')
  const MM = pad(kst.getUTCMonth() + 1)
  const dd = pad(kst.getUTCDate())
  const hh = pad(kst.getUTCHours())
  const mm = pad(kst.getUTCMinutes())
  const ss = pad(kst.getUTCSeconds())
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}+09:00`
}

// epochMs 시점의 KST 시:분(`HH:mm`). 02의 입장 OPEN 전 안내에 쓴다.
export function formatKstHHmm(epochMs: number): string {
  return toKstIsoString(epochMs).slice(11, 16)
}

// `YYYY-MM-DDTHH:mm:ss+09:00`만 epoch ms로 바꾼다. Z, 다른 오프셋, 소수점 초, 달력에 없는 날짜(2월 30일 등)는 null.
export function parseKstIso(value: unknown): number | null {
  if (typeof value !== 'string' || !KST_ISO_PATTERN.test(value)) return null
  const ms = new Date(value).getTime()
  if (!Number.isFinite(ms) || toKstIsoString(ms) !== value) return null
  return ms
}
