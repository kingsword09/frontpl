---
name: frontpl-scaffold
description: Scaffold new frontend projects with standardized TypeScript/ESM tooling via the frontpl CLI and Vite+ single-config tooling. Use when the user wants to create a new frontend project, initialize a project template, set up Vite+ lint/format/test/pack in vite.config.ts, or generate a project scaffold with GitHub Actions CI/release workflows. Triggers on requests like "create a new frontend project", "scaffold a TypeScript project", "initialize a project with frontpl", or "set up a new package with CI".
metadata:
  author: kingsword09
  version: "0.3.2"
---

# Scaffold Frontend Projects with frontpl

## Quick Start

```bash
npx frontpl my-project
# or
npx frontpl init my-project
```

Run the command and follow the interactive prompts. All options have sensible defaults.

## Interactive Prompts Reference

| Prompt             | Type    | Default       | Options                                                         |
| ------------------ | ------- | ------------- | --------------------------------------------------------------- |
| Project name       | text    | `my-frontend` | letters, numbers, `.`, `_`, `-`; cannot start with `.` or `_`   |
| Package manager    | select  | `pnpm`        | npm, yarn, pnpm, bun, deno                                      |
| pnpm workspace     | confirm | `false`       | Only shown when pnpm selected; creates monorepo skeleton        |
| Vite+ lint         | confirm | `true`        | Enables `@kingsword/lint-config` preset with type-aware linting |
| Vite+ format       | confirm | `true`        | Enables Oxfmt through Vite+ `fmt`                               |
| Vite+ test         | confirm | `false`       | Adds `vp test` + example test via `vite-plus/test`              |
| Vite+ pack build   | confirm | `true`        | Adds `vp pack` build configuration                              |
| Git init           | confirm | `true`        | Initialize git repository                                       |
| GitHub Actions     | select  | `ci`          | none, ci, ci+release                                            |
| Release mode       | select  | `tag`         | tag (recommended), commit (legacy), both; only if ci+release    |
| Dependabot         | confirm | `true`        | Only if git + GitHub Actions enabled                            |
| Trusted publishing | confirm | `true`        | npm OIDC; only if ci+release and not deno                       |

## Generated File Structure

```
my-project/
├── .editorconfig
├── .gitignore
├── .gitattributes
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts
│   └── index.test.ts          # if vitest enabled
├── vite.config.ts              # if Vite+ tooling is enabled
├── deno.json                   # if deno selected
└── .github/
    ├── workflows/
    │   ├── ci.yml              # if GitHub Actions enabled
    │   └── release.yml         # if ci+release enabled
    └── dependabot.yml          # if Dependabot enabled
```

For pnpm workspace mode, package files go under `packages/<name>/` with a root `pnpm-workspace.yaml`. Root `vite.config.ts` owns lint/format, while the package-level `vite.config.ts` is only generated when test/pack is enabled.

## Lint Strategy

- **Vite+ lint enabled** (default): generates `lint: vp lint` and `lint:fix: vp lint --fix`. No separate `typecheck` script because lint runs with type-aware type checking.
- **Vite+ lint disabled**: generates `typecheck: tsc --noEmit`, unless workspace root lint already owns checking.

Do not generate standalone `oxlint.config.ts`, `.oxfmtrc.json`, or `tsdown.config.ts` for new projects. Vite+ lint, fmt, test, and pack settings belong in `vite.config.ts`.

## CI Workflow Behavior

Generated CI workflows call the reusable workflow `kingsword09/workflows/.github/workflows/cli-ci.yml`, pinned to a specific commit SHA. Explicit `lintCommand`, `formatCheckCommand`, and `testCommand` are passed to avoid implicit behavior.

## After Scaffolding

```bash
cd my-project
pnpm run lint        # vp lint, or npm/yarn/bun equivalent
```

The CLI auto-detects the installed package manager version and runs `install` during scaffolding. If the package manager is not found, install dependencies manually.

## Existing Projects

For existing projects that already use ESLint/Prettier, use:

- `npx frontpl oxlint` to migrate/add Vite+ lint
- `npx frontpl oxfmt` to migrate/add Vite+ format
