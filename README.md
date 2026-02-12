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

Generated output includes (based on options):

- `.editorconfig`, `.gitignore`, `.gitattributes`
- `package.json` (+ scripts like optional `lint`, `format:check`, `test`, `build`)
- `tsconfig.json`, `src/index.ts`
- Optional configs: `oxlint.config.ts`, `.oxfmtrc.json`, `tsdown.config.ts`
- Optional GitHub Actions workflows in `.github/workflows/`

### `frontpl ci`

Add or update CI/Release workflows for an existing project (run it in your repo root).

What it does:

- Detects the package manager via `package.json#packageManager` or lockfiles
- Suggests a `workingDirectory` (supports monorepo layouts like `packages/*` / `apps/*`)
- Detects Node.js major version from `.nvmrc`, `.node-version`, or `package.json#engines.node` (defaults to `22`)
- Generates `.github/workflows/ci.yml`
- Optionally generates `.github/workflows/release.yml` (tag/commit/both)
- Optionally generates `.github/dependabot.yml` with grouped updates (`dependencies`, `github-actions`)

### `frontpl oxfmt`

Add/migrate formatting in the current project to `oxfmt`.

What it does:

- Asks config strategy interactively:
  - Migrate from Prettier (`oxfmt --migrate=prettier`)
  - Rebuild `.oxfmtrc.json` (current mode)
- Ensures `package.json` scripts use:
  - `format`: `oxfmt`
  - `format:check`: `oxfmt --check`
  - `fmt`: `oxfmt`
  - `fmt:check`: `oxfmt --check`
- Ensures `devDependencies.oxfmt` exists (defaults to `latest` when missing)
- Creates or updates `.oxfmtrc.json`
- Optionally removes `prettier` / `prettier-plugin-*` / `@prettier/plugin-*` dependencies, `package.json#prettier`, and Prettier config files (`.prettierrc*`, `prettier.config.*`)
- Optionally installs dependencies with detected package manager

Use `--yes` (or `-y`) to skip confirmations and apply default choices.

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
- Maps JavaScript package managers (`npm`/`pnpm`/`yarn`/`bun`) to Dependabot `package-ecosystem: "npm"`

## Development

```sh
pnpm install
pnpm run lint
pnpm run build
node dist/cli.mjs --help
node dist/cli.mjs ci
```

## Lint preset

This repository itself uses `@kingsword/lint-config` (see `oxlint.config.ts`).
