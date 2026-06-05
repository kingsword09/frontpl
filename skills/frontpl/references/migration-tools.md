# Migration Tools Reference (`oxlint` / `oxfmt`)

## `frontpl oxlint`

### Purpose

Add or migrate existing-project linting to the Vite+ `lint` block in `vite.config.ts`.

### Strategy prompt

- `init`: only create/update the `vite.config.ts` lint block; leave `package.json`, scripts, and deps unchanged
- `migrate`: keep ESLint assets, add Vite+ lint scripts/config/dependencies
- `replace`: remove ESLint and legacy Oxlint assets, then switch fully to Vite+ lint

### Behavior

- Ensures scripts in migrate/replace mode:
  - `lint: vp lint`
  - `lint:fix: vp lint --fix`
- Removes `typecheck: tsc --noEmit` when confirmed (default true in `--yes` mode)
- Ensures devDependencies:
  - `vite-plus`
  - `oxlint`
  - `@kingsword/lint-config`
- Removes legacy `oxlint-tsgolint` when present
- Writes or updates `vite.config.ts`
  - Uses `test: "vitest"` when `scripts.test` contains `vitest`
  - Otherwise `test: "none"`

### Replace-mode cleanup

Removes:

- `package.json#eslintConfig`
- ESLint ecosystem deps in `dependencies` and `devDependencies`:
  - `eslint`, `typescript-eslint`, `@eslint/*`, `@typescript-eslint/*`, `eslint-*`, scoped `eslint-(plugin|config|import-resolver)-*`
- Config files:
  - `.eslintrc*`
  - `eslint.config.*` (`js/cjs/mjs/ts/cts/mts`)
  - `.oxlintrc*`
  - `oxlint.config.*`

### Non-interactive default (`--yes`)

- Strategy defaults to `replace`

---

## `frontpl oxfmt`

### Purpose

Add or migrate existing-project formatting to the Vite+ `fmt` block in `vite.config.ts`.

### Strategy prompt

- `init`: only create/update the `vite.config.ts` fmt block; leave `package.json`, scripts, and deps unchanged
- `migrate`: keep Prettier assets, add Vite+ format scripts/config/dependencies
- `replace`: remove Prettier and legacy Oxfmt assets, then switch fully to Vite+ format

### Behavior

- Ensures scripts in migrate/replace mode:
  - `format: vp fmt`
  - `format:check: vp fmt --check`
- Removes matching legacy `fmt` / `fmt:check` scripts when they point at old or new format commands
- Ensures `devDependencies.vite-plus`
- Removes direct `oxfmt` dependency when present
- Writes or updates `vite.config.ts` with a Vite+ `fmt` block

### Prettier cleanup

When cleanup is confirmed:

- Removes `package.json#prettier`
- Removes prettier deps:
  - `prettier`
  - `prettier-plugin-*` (supports scoped plugin names)
  - `@prettier/plugin-*`
- Removes config files:
  - `.prettierrc*`
  - `prettier.config.*` (`js/cjs/mjs/ts/cts/mts`)
  - legacy `.oxfmtrc.json`

### Non-interactive default (`--yes`)

- Strategy defaults to `replace`
