import { useEffect, useState, type ReactNode } from 'react'
import { claimCoupons, getCoupons, type ClaimResult, type Coupon, type ElementKey } from '../api'
import { useEventInfo } from '../hooks/useEventInfo'
import { classifyError } from '../lib/errors'
import { alignClassOf, stackOrder } from '../lib/layout'
import { safeReturnUrl } from '../lib/safeReturnUrl'
import ErrorNotice from './ErrorNotice'

// 04 쿠폰 발급 + 05/06 결과 모달. (CLAUDE.md §4)
// 제목, 배너, 쿠폰 목록, 발급 버튼 4개 요소를 layout에 따라 02 카드와 같은 폭의 한 열로 쌓는다(§6.1).
// 순서는 v가 먼저이고 같은 v는 고정 순서, h는 가로 정렬이다. 순서·클래스 계산은 lib/layout.ts만 쓴다.
// TODO(미정): 04를 직접 열었을 때(03을 거치지 않고 /issue로 들어옴)의 처리. 서버는 순서(내 번호 ≤ 커서)를
// 검증하지 않으므로 지금은 그대로 쿠폰 목록과 발급 버튼을 보여 준다. (CLAUDE.md §7.5, §13)
export default function CouponIssuance() {
  const eventInfo = useEventInfo()
  const { eventId } = eventInfo
  const [coupons, setCoupons] = useState<Coupon[] | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState<ClaimResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [returnMissing, setReturnMissing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // claim 응답을 못 받은 상태(네트워크 예외, 502, 504). 서버에서는 발급이 끝났을 수 있어 실패로 보지 않는다.
  const [claimPending, setClaimPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCoupons(eventId).then(
      (list) => {
        if (!cancelled) setCoupons(list)
      },
      (e) => {
        if (!cancelled) setError(e ?? new Error('불러오기 실패'))
      },
    )
    return () => {
      cancelled = true
    }
  }, [eventId, attempt])

  async function handleClaim() {
    if (claiming) return
    setClaiming(true)
    try {
      const res = await claimCoupons(eventId)
      setClaimPending(false)
      setResult(res.result)
    } catch (e) {
      if (classifyError(e) === 'network') {
        // 응답을 못 받았다(네트워크 예외, 502, 504). 서버에서는 발급이 끝났을 수 있어 에러 화면이 아니라
        // "발급 여부 확인 중"으로 둔다. 결과 조회 API는 없다. 같은 사용자가 claim을 다시 보내면 처음 결과가
        // 200으로 그대로 오므로 "다시 확인"은 claim을 다시 보내고 그 응답으로 05/06 모달을 연다. (CLAUDE.md §7.4)
        setClaimPending(true)
      } else {
        setClaimPending(false)
        setError(e ?? new Error('쿠폰 발급 실패'))
      }
    } finally {
      setClaiming(false)
    }
  }

  function handleConfirm() {
    // 이동 전에 returnUrl을 검증한다. 통과하지 못하면(빈 문자열, http/https 아님 등) 이동하지 않고
    // 모달을 닫지 않은 채 안내 문구를 보여 준다. (CLAUDE.md §4, 확정)
    const target = safeReturnUrl(eventInfo.returnUrl)
    if (target !== null) {
      window.location.assign(target)
      return
    }
    setReturnMissing(true)
  }

  if (error !== null) {
    // 다시 시도: 같은 요청(쿠폰 목록 등)을 한 번 다시 보낸다.
    return (
      <ErrorNotice
        error={error}
        onRetry={() => {
          setError(null)
          setAttempt((a) => a + 1)
        }}
      />
    )
  }

  if (!coupons) {
    return <div className="page page-center">불러오는 중...</div>
  }

  const { layout } = eventInfo
  const elements: Record<ElementKey, ReactNode> = {
    title: <h1 className="issue-title">{eventInfo.name}</h1>,
    // 배너가 빈 값이면 그리지 않는다(깨진 이미지 금지).
    banner: eventInfo.bannerUrl !== '' ? <img className="banner" src={eventInfo.bannerUrl} alt="" /> : null,
    // "받을 수 있는 쿠폰 N장"은 쿠폰 목록과 한 요소로 묶어 같은 칸에 함께 놓는다.
    couponList: (
      <div className="issue-coupons">
        <div className="caption">받을 수 있는 쿠폰 {coupons.length}장</div>
        <ul className="coupon-list">
          {coupons.map((coupon) => (
            <li key={coupon.couponId} className="coupon-item">
              <div className="coupon-name">{coupon.name}</div>
              <div className="coupon-description">{coupon.description}</div>
            </li>
          ))}
        </ul>
      </div>
    ),
    issueButton: (
      <button className="primary-button" disabled={claiming} onClick={handleClaim}>
        쿠폰 받기 (전체 발급)
      </button>
    ),
  }

  return (
    <div className="page">
      <div className="layout-stack">
        {stackOrder(layout).map(
          (key) =>
            elements[key] !== null && (
              <div key={key} className={`layout-item ${alignClassOf(layout[key].h)}`}>
                {elements[key]}
              </div>
            ),
        )}
      </div>

      {claimPending && (
        <div className="modal-overlay">
          <div className="modal">
            {/* 문구는 화면설계서에 없어 팀이 정했다. */}
            <p className="modal-message">발급 여부를 확인하고 있어요</p>
            <button className="primary-button" disabled={claiming} onClick={handleClaim}>
              다시 확인
            </button>
          </div>
        </div>
      )}

      {result !== null && (
        <div className="modal-overlay">
          <div className="modal">
            {result === 'SUCCESS' ? (
              <>
                <p className="modal-message">쿠폰이 발급되었습니다</p>
              </>
            ) : (
              <>
                <p className="modal-message">쿠폰이 모두 소진되었습니다</p>
                <p className="modal-submessage">
                  아쉽지만 준비된 수량이 모두 발급되었어요. 다음 이벤트에서 다시 만나요.
                </p>
              </>
            )}
            {returnMissing && (
              <p className="modal-submessage">이동할 페이지 주소를 찾을 수 없습니다.</p>
            )}
            <button className="primary-button" onClick={handleConfirm}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
