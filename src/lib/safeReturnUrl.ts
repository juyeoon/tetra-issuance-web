// returnUrl(테넌트 복귀 주소)은 테넌트가 입력한 값이 그대로 event.json에 들어온다. 이동하기 전에 프런트가 따로 검증한다
// (백엔드 검증과 별개, 확정). URL로 파싱되고 protocol이 http: 또는 https:일 때만 그 값을 돌려준다.
// 빈 문자열, 파싱 실패, javascript: 등은 null이고, 이때는 이동하지 않는다. (CLAUDE.md §4)
export function safeReturnUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
}
