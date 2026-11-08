import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safeRedirect'

describe('safeNextPath', () => {
  it.each(['/account', '/jobs/42', '/jobs?q=accounts&district=kampala', '/a/b#section'])(
    'accepts the site path %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path)
    },
  )

  it.each([
    null,
    undefined,
    '',
    'account',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    'https://evil.example',
    'http://localhost:5173/account',
    'javascript:alert(1)',
    '/\t/evil.example',
    '/\n/evil.example',
  ])('rejects %j', (value) => {
    expect(safeNextPath(value)).toBeNull()
  })
})
