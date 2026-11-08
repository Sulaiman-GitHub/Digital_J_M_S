import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers.ts'
import { backendDir, python, repoDir } from './paths.ts'

/**
 * The profile form needs districts, institutions and so on. Load them into the *_test database
 * before the tests start. The script is safe to run again (it only adds or updates rows).
 * APP_ENV=test makes it use TEST_DATABASE_URL, never the development database.
 */
export default function globalSetup() {
  execFileSync(python, [path.join(repoDir, 'scripts', 'seed_reference.py')], {
    cwd: backendDir,
    env: { ...process.env, APP_ENV: 'test' },
    stdio: 'inherit',
  })
  // The admin the employer tests log in as. The script refuses to run outside APP_ENV=test.
  execFileSync(python, [path.join(repoDir, 'frontend', 'e2e', 'seed_admin.py')], {
    cwd: backendDir,
    env: {
      ...process.env,
      APP_ENV: 'test',
      E2E_ADMIN_EMAIL: ADMIN_EMAIL,
      E2E_ADMIN_PASSWORD: ADMIN_PASSWORD,
    },
    stdio: 'inherit',
  })
}
