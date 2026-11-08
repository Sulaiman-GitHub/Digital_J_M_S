import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// findBy and waitFor give up after one second by default. A shared CI runner can be several times
// slower than a laptop, so a screen that renders in 200 ms here may need more there.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
