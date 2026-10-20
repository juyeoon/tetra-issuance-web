import { describe, expect, it } from 'vitest'
import { safeReturnUrl } from './safeReturnUrl'

describe('safeReturnUrl', () => {
  it('http, https 주소는 그 값을 그대로 돌려준다', () => {
    expect(safeReturnUrl('https://www.a-corp.com/event')).toBe('https://www.a-corp.com/event')
    expect(safeReturnUrl('http://a-corp.com/event?x=1#y')).toBe('http://a-corp.com/event?x=1#y')
    expect(safeReturnUrl('HTTPS://A-CORP.COM/')).toBe('HTTPS://A-CORP.COM/')
  })

  it('빈 문자열, 파싱 실패, 상대 경로는 null', () => {
    expect(safeReturnUrl('')).toBeNull()
    expect(safeReturnUrl('   ')).toBeNull()
    expect(safeReturnUrl('not a url')).toBeNull()
    expect(safeReturnUrl('/event')).toBeNull()
    expect(safeReturnUrl('//a-corp.com/event')).toBeNull()
  })

  it('http, https가 아닌 scheme은 null', () => {
    expect(safeReturnUrl('javascript:alert(1)')).toBeNull()
    expect(safeReturnUrl(' javascript:alert(1)')).toBeNull()
    expect(safeReturnUrl('JavaScript:alert(1)')).toBeNull()
    expect(safeReturnUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeReturnUrl('ftp://a-corp.com/')).toBeNull()
    expect(safeReturnUrl('mailto:a@a-corp.com')).toBeNull()
  })
})
