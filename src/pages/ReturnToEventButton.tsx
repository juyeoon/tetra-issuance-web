import { safeReturnUrl } from '../lib/safeReturnUrl'

// "이벤트 페이지로 돌아가기" 버튼. 누르면 테넌트 페이지(returnUrl)로 이동해 재진입한다.
// returnUrl이 safeReturnUrl을 통과하지 못하면(빈 문자열, http/https 아님 등) 버튼을 그리지 않는다. (CLAUDE.md §4, §7.3)
// 02의 입장 OPEN 전 안내와 401·403 에러 화면이 같이 쓴다.
export default function ReturnToEventButton({ returnUrl }: { returnUrl: string }) {
  const target = safeReturnUrl(returnUrl)
  if (target === null) return null
  return (
    <button className="primary-button" onClick={() => window.location.assign(target)}>
      이벤트 페이지로 돌아가기
    </button>
  )
}
