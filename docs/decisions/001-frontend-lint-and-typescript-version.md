# 001: ESLint instead of oxlint, TypeScript pinned to 6.0

- Status: accepted
- Date: 2026-11-04
- Module: 0.3 (frontend scaffold)

## Context

The current Vite `react-ts` template ships with **oxlint** and **TypeScript 7.0** (the native
compiler). The project's engineering standards require **ESLint**
("ruff and eslint clean", `npm run lint`).

ESLint needs `typescript-eslint` to lint TypeScript. `typescript-eslint` 8.72.1 declares a peer
dependency of `typescript >=4.8.4 <6.1.0`, so it does not support TypeScript 7. Installing it
anyway (`--force` / `--legacy-peer-deps`) gives an unsupported, possibly broken lint setup.

## Decision

1. Use ESLint (flat config, `frontend/eslint.config.js`) with `@eslint/js`, `typescript-eslint`,
   `globals`, `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`. Remove oxlint.
2. Pin TypeScript to **6.0.3**, the newest version `typescript-eslint` supports.
3. All direct frontend dependencies are pinned to exact versions in `package.json`.

## Consequences

- `npm run lint` runs ESLint as the project standards expect; CI uses the same command.
- The ESLint plugins above are extra dev dependencies not in the original dependency list. They are lint-only and
  never ship to users.
- `npm audit` reports a moderate `minimatch` advisory inside the ESLint toolchain (dev-only). The
  suggested `--force` fix downgrades `typescript-eslint` and is not applied. Re-check when upgrading.
- Revisit: when `typescript-eslint` supports TypeScript 7, upgrade TypeScript and remove this pin.

## Also recorded

- Prettier uses `"endOfLine": "auto"` (`frontend/.prettierrc`). Git on Windows is set to
  `core.autocrlf=true`, which checks files out with CRLF; the repository content stays LF, so CI is
  unaffected.
