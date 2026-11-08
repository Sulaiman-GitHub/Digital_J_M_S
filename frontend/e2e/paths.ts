import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export const repoDir = path.resolve(here, '..', '..')
export const backendDir = path.join(repoDir, 'backend')

const venvPython =
  process.platform === 'win32'
    ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
    : path.join(backendDir, '.venv', 'bin', 'python')

/** The backend's virtual environment if there is one (local), else the python on PATH (CI). */
export const python = fs.existsSync(venvPython) ? venvPython : 'python'
