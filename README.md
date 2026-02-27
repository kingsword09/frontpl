# frontpl

Interactive CLI to scaffold standardized frontend project templates (with optional CI/Release workflows).

> Node.js >= 22

## Install

```sh
# If published on npm:
npm i -g frontpl
# or
pnpm add -g frontpl

# Or run once via npx:
npx frontpl --help
```

## Quick start

```sh
frontpl my-frontend
# or
frontpl init my-frontend
```

Follow the prompts to choose:

- Package manager (`npm`/`pnpm`/`yarn`/`bun`/`deno`)
- Optional `pnpm workspace` mode (monorepo skeleton)
- Optional tooling: `oxlint`, `oxfmt`, `vitest`, `tsdown`

When `oxlint` is enabled, generated projects use `@kingsword/lint-config` via `oxlint.config.ts`.
Generated lint-related dependencies (`oxlint`, `oxlint-tsgolint`, `oxfmt`, `@kingsword/lint-config`) default to `latest` in scaffolded `package.json`.

- Git init
- GitHub Actions workflows:
  - CI only
  - CI + release (release supports tag/commit/both)

## Commands

### `frontpl [name]` / `frontpl init [name]`

Scaffold a new project into `./<name>` (or prompt for a name when omitted).
Project names support letters (including uppercase/camel case), numbers, `.`, `_`, `-` (cannot start with `.` or `_`).

Generated output includes (based on options):

- `.editorconfig`, `.gitignore`, `.gitattributes`
- `package.json` (+ scripts like optional `lint`, `format:check`, `test`, `build`)
- `tsconfig.json`, `src/index.ts`
- Generated `tsconfig.json` enables `allowImportingTsExtensions` for `.ts` import paths
- Relative TypeScript imports use explicit `.ts` extensions (e.g. generated `src/index.test.ts`)
- Optional configs: `oxlint.config.ts`, `.oxfmtrc.json`, `tsdown.config.ts`
- Optional GitHub Actions workflows in `.github/workflows/`

When `pnpm workspace mode` is enabled:

- Root contains `pnpm-workspace.yaml` and the workspace `package.json`
- Workspace root `package.json` includes `"type": "module"`
- `oxlint`/`oxfmt` scripts, dependencies, and config files are generated at the workspace root
- App/library package is scaffolded under `packages/<name>/` with its own `package.json`, `src`, and `tsconfig.json`
- If root `oxlint` is enabled, package `package.json` does not add redundant `typecheck: tsc --noEmit`

### `frontpl add [name]`

Add a new package under `packages/<name>/` in an existing `pnpm workspace`.

What it does:

- Requires workspace root (`pnpm-workspace.yaml`) and `pnpm` package manager
- Generates package baseline files:
  - `packages/<name>/package.json`
  - `packages/<name>/README.md`
  - `packages/<name>/src/index.ts`
  - `packages/<name>/tsconfig.json`
- Optionally adds `vitest` (`src/index.test.ts`) and `tsdown` (`tsdown.config.ts`)
- Reuses root toolchain strategy:
  - package does not scaffold `oxlint`/`oxfmt` scripts
  - if root `oxlint` exists, package does not scaffold `typecheck: tsc --noEmit`

Use `--yes` (or `-y`) to skip confirmations and use defaults inferred from root scripts.

### `frontpl pkg`

Normalize current directory `package.json` for npm publishing (requires `github.com` git remote).

What it does:

- Requires current directory to contain `package.json`
- Requires git repository with `remote.origin.url` on `github.com`
- Updates publish metadata:
  - `homepage`
  - `bugs.url`
  - `repository` (`type`, `url`, and `directory` when run in monorepo subfolder)
- Applies publish defaults when missing:
  - `private: false`, `version: "0.0.0"`
  - `license`:
    - interactive select on each run (`MIT` / `Apache-2.0`)
    - with `--yes`, keeps existing license; defaults to `MIT` only when missing
    - option keys aligned with GitHub Licenses API: `mit` / `apache-2.0`
  - `type: "module"`, `files: ["dist"]`
  - `main`, `types`, and `exports` pointing to `dist/index`
  - `publishConfig.access: "public"`
  - `engines.node: ">=22.0.0"`
  - `scripts.prepublishOnly` from existing `scripts.build`

Use `--yes` (or `-y`) to skip confirmation.

### `frontpl bump [target]`

Update current `package.json#version` without opening an editor.

Interactive mode (`frontpl bump`):

- Shows concrete candidate versions for `patch` / `minor` / `major`
  - e.g. current `1.2.3` -> `1.2.4` / `1.3.0` / `2.0.0`
- `custom`: set explicit version text

Direct mode (`frontpl bump <target>`):

- `frontpl bump patch`
- `frontpl bump minor`
- `frontpl bump major`
- `frontpl bump 1.8.0`

When using `minor`/`major`, trailing segments are reset to `0`.
Use `--dry-run` to preview from/to version without writing `package.json`.

### `frontpl ci`

Add or update CI/Release workflows for an existing project (run it in your repo root).

What it does:

- Detects the package manager via `package.json#packageManager` or lockfiles
- Suggests a `workingDirectory` (supports monorepo layouts like `packages/*` / `apps/*`)
- Detects Node.js major version from `.nvmrc`, `.node-version`, or `package.json#engines.node` (defaults to `22`)
- Generates `.github/workflows/ci.yml`
- Optionally generates `.github/workflows/release.yml` (tag/commit/both)
- Optionally generates `.github/dependabot.yml` with grouped updates (`dependencies`, `github-actions`)

### `frontpl oxlint`

Add/migrate linting in the current project to `oxlint`.

What it does:

- Asks strategy interactively:
  - Migrate gradually (keep existing ESLint assets)
  - Replace ESLint directly (current mode)
- Ensures `package.json` scripts use:
  - `lint`: `oxlint --type-aware --type-check`
  - `lint:fix`: `oxlint --type-aware --type-check --fix`
- Removes `typecheck: tsc --noEmit` when confirmed (or by default with `--yes`)
- Ensures devDependencies exist:
  - `oxlint`
  - `oxlint-tsgolint`
  - `@kingsword/lint-config`
- Creates or updates `oxlint.config.ts` using `@kingsword/lint-config`
- In replace mode, removes ESLint deps/configs (`eslint*`, `@eslint/*`, `@typescript-eslint/*`, `eslintConfig`, `.eslintrc*`, `eslint.config.*`)
- Optionally installs dependencies with detected package manager

Use `--yes` (or `-y`) to skip confirmations and apply default choices.
With `--yes`, strategy defaults to `replace`.

### `frontpl oxfmt`

Add/migrate formatting in the current project to `oxfmt`.

What it does:

- Asks config strategy interactively:
  - Migrate from Prettier (`oxfmt --migrate=prettier`)
  - Rebuild `.oxfmtrc.json` (current mode)
- Ensures `package.json` scripts use:
  - `format`: `oxfmt`
  - `format:check`: `oxfmt --check`
- Ensures `devDependencies.oxfmt` exists (defaults to `latest` when missing)
- Creates or updates `.oxfmtrc.json`
- Rebuild mode writes baseline formatter options:
  - `$schema: "./node_modules/oxfmt/configuration_schema.json"`
  - `useTabs: false`, `indentWidth: 2`, `lineWidth: 100`
  - `trailingComma: "all"`, `semi: true`, `singleQuote: false`, `arrowParens: "always"`
- Optionally removes `prettier` / `prettier-plugin-*` / `@prettier/plugin-*` dependencies, `package.json#prettier`, and Prettier config files (`.prettierrc*`, `prettier.config.*`)
- Optionally installs dependencies with detected package manager

Use `--yes` (or `-y`) to skip confirmations and apply default choices.
With `--yes`, config strategy defaults to rebuild `.oxfmtrc.json`.

## GitHub Actions (CI + Release)

frontpl generates workflows that call reusable workflows from `kingsword09/workflows` (pinned to commit SHA + `# vX.Y.Z` comment by default):

- CI: `cli-ci.yml`
- Release (tag, recommended): `cli-release-tag.yml`
- Release (commit, legacy): `cli-release.yml`

### Release modes

- **Tag (recommended)**: trigger on tag push (`vX.Y.Z`), validate `package.json#version` matches the tag.
- **Commit (legacy)**: trigger on `main` push, publish only when the commit message matches `chore(release): vX.Y.Z` (also supports `chore: release vX.Y.Z`), and the workflow will create/push the tag.
- **Both**: a single `release.yml` listens to both `main` and `tags`, and routes to the corresponding reusable workflow.

### Publishing auth

- **Trusted publishing (OIDC)**: enable `trustedPublishing: true` (no `NPM_TOKEN` required). Your repo must be configured on npm as a trusted publisher for the calling workflow.
- **NPM token**: set `trustedPublishing: false` and provide `NPM_TOKEN` in GitHub secrets.

## Dependabot (optional)

When CI workflows are enabled, frontpl can also generate `.github/dependabot.yml`:

- Keeps `github-actions` updates enabled
- Adds grouped dependencies updates (`groups.dependencies`)
- Uses the selected `workingDirectory` (`.` -> `/`, monorepo package -> `/packages/<name>`)
- In `frontpl init` + `pnpm workspace mode`, default `workingDirectory` is workspace root (`/`)
- Maps JavaScript package managers (`npm`/`pnpm`/`yarn`/`bun`) to Dependabot `package-ecosystem: "npm"`

## Development

```sh
pnpm install
pnpm run lint
pnpm run build
node dist/cli.mjs --help
node dist/cli.mjs ci
node dist/cli.mjs oxlint --help
node dist/cli.mjs oxfmt --help
```

## Lint preset

This repository itself uses `@kingsword/lint-config` (see `oxlint.config.ts`).
