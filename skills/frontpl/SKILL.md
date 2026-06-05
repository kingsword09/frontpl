---
name: frontpl
description: Interactive CLI to scaffold standardized frontend projects with Vite+ single-config tooling, add packages to pnpm workspaces, normalize package metadata, bump versions, migrate ESLint/Prettier or legacy oxlint/oxfmt configs to Vite+ lint/format, and add GitHub Actions CI/release workflows. Use when the user wants to create a new frontend project, initialize a TypeScript/ESM template with Vite+ lint/format/test/pack, add a workspace package, prepare package.json for publishing, bump package versions, migrate tooling into vite.config.ts, add CI pipelines or release automation, configure Dependabot, or contribute to the frontpl codebase. Triggers on requests like "create a new frontend project", "scaffold a TypeScript project", "add package to workspace", "migrate from eslint/prettier", "migrate to vite plus", "add CI to my project", "set up GitHub Actions", or "fix a bug in frontpl".
metadata:
  author: kingsword09
  version: "0.3.2"
---

# frontpl

Interactive CLI to scaffold standardized frontend project templates with optional CI/release workflows.

## Commands

### `frontpl [name]` / `frontpl init [name]` — Scaffold a new project

```bash
npx frontpl my-project
```

Creates a complete project directory with TypeScript/ESM config, optional Vite+ tooling (lint, format, test, pack), git init, and GitHub Actions workflows. Vite+ tool configuration is consolidated in `vite.config.ts`.

See [references/scaffold.md](references/scaffold.md) for full prompt reference and generated file structure.

### `frontpl add [name]` — Add a package to a pnpm workspace

```bash
cd /path/to/workspace
npx frontpl add my-package
```

Requires an existing pnpm workspace. Generates package baseline files under `packages/<name>/`, reuses root-managed lint/format, and can add package-level Vite+ test/pack config.

### `frontpl pkg` — Normalize package metadata for publishing

```bash
cd /path/to/package
npx frontpl pkg
```

Uses the GitHub remote to fill publish metadata, package exports, Node engine, files, and publish defaults. With `--yes`, keeps an existing license and defaults to MIT only when missing.

### `frontpl bump [target]` — Bump package version

```bash
npx frontpl bump patch
```

Supports `patch`, `minor`, `major`, or an explicit version. Use `--dry-run` to preview without writing `package.json`.

### `frontpl ci` — Add CI workflows to an existing project

```bash
cd /path/to/existing/project
npx frontpl ci
```

Auto-detects package manager, Node.js version, working directory, and existing scripts. Generates CI/release workflows and Dependabot config.

See [references/ci-setup.md](references/ci-setup.md) for auto-detection details and workflow architecture.

### `frontpl oxlint` — Migrate/add Vite+ lint for existing projects

```bash
cd /path/to/existing/project
npx frontpl oxlint
```

Supports interactive strategy selection:

- `init`: initialize only the `vite.config.ts` lint block
- `migrate`: keep existing ESLint assets and add Vite+ lint
- `replace`: remove ESLint and legacy Oxlint assets, then switch fully to Vite+ lint

### `frontpl oxfmt` — Migrate/add Vite+ format for existing projects

```bash
cd /path/to/existing/project
npx frontpl oxfmt
```

Supports interactive strategy selection:

- `init`: initialize only the `vite.config.ts` fmt block
- `migrate`: keep existing Prettier assets and add Vite+ format
- `replace`: remove Prettier and legacy Oxfmt assets, then switch fully to Vite+ format

See [references/migration-tools.md](references/migration-tools.md) for migration behavior and cleanup rules.

## Key Conventions

- **Package managers**: npm, pnpm, yarn, bun, deno (all 5 supported)
- **Vite+ config**: generated Vite+ lint, format, test, and pack settings live in `vite.config.ts`; do not generate `oxlint.config.ts`, `.oxfmtrc.json`, or `tsdown.config.ts` for new projects.
- **Lint strategy**: Vite+ lint enabled (default) generates `lint: vp lint` and `lint:fix: vp lint --fix`; disabled generates `typecheck: tsc --noEmit` unless root workspace lint owns checking.
- **Format/build/test scripts**: Vite+ format uses `vp fmt` / `vp fmt --check`; tests use `vp test`; pack builds use `vp pack`.
- **Migration defaults**: `oxlint --yes` and `oxfmt --yes` both default to `replace`.
- **CI workflows**: Call reusable workflows from `kingsword09/workflows`, pinned to commit SHA. Explicit `lintCommand`, `formatCheckCommand`, `testCommand` passed to avoid implicit behavior.
- **Monorepo**: pnpm workspace mode scaffolds `packages/<name>/` structure. CI `workingDirectory` parameter handles subdirectory builds.

## Development

For contributing to the frontpl codebase (architecture, adding templates/commands, testing), see [references/development.md](references/development.md).
