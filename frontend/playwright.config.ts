import { defineConfig, devices } from '@playwright/test'
import { backendDir, python } from './e2e/paths.ts'

const isCI = Boolean(process.env.CI)

// The backend runs from ../backend in APP_ENV=test: it uses TEST_DATABASE_URL (a *_test database),
// keeps emails in memory for the test-only inbox endpoint, and never sends real mail.

// End-to-end tests. `npx playwright test` starts the backend and the frontend itself.
// Do not run them while pytest runs: both use the *_test database.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `"${python}" -m uvicorn app.main:app --port 8000`,
      cwd: backendDir,
      // Readiness = the API answers and the database is reachable.
      url: 'http://localhost:8000/api/v1/health',
      // Never reuse a server already on port 8000: a development backend would not be in
      // test mode, so the inbox endpoint would be missing and the wrong database in use.
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...(process.env as Record<string, string>),
        APP_ENV: 'test',
        // One browser makes many register/login requests from one address.
        AUTH_RATE_LIMIT: '1000/minute',
      },
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
})
