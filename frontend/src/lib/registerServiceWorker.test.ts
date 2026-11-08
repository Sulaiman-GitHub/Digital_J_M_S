import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker'

describe('registerServiceWorker', () => {
  it('does nothing outside production builds', () => {
    const register = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    const add = vi.spyOn(window, 'addEventListener')
    registerServiceWorker()
    expect(add).not.toHaveBeenCalledWith('load', expect.anything())
    expect(register).not.toHaveBeenCalled()
  })

  it('registers /sw.js after load in production', () => {
    vi.stubEnv('PROD', true)
    const register = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    expect(register).toHaveBeenCalledWith('/sw.js')
    vi.unstubAllEnvs()
  })
})
