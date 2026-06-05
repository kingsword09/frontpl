# Scaffold Reference

## Quick Start

```bash
npx frontpl my-project
# or
npx frontpl init my-project
```

## Interactive Prompts

| Prompt             | Type    | Default       | Options                                                            |
| ------------------ | ------- | ------------- | ------------------------------------------------------------------ |
| Project name       | text    | `my-frontend` | letters, numbers, `.`, `_`, `-`; cannot start with `.` or `_`      |
| Package manager    | select  | `pnpm`        | npm, yarn, pnpm, bun, deno                                         |
| pnpm workspace     | confirm | `false`       | Only shown when pnpm selected; creates monorepo skeleton           |
| Vite+ lint         | confirm | `true`        | Enables `@kingsword/lint-config` preset with type-aware linting    |
| Vite+ format       | confirm | `true`        | Enables Oxfmt through Vite+ `fmt`                                  |
| Vite+ test         | confirm | `false`       | Adds `vp test` + example test via `vite-plus/test`                 |
| Vite+ pack build   | confirm | `true`        | Adds `vp pack` build configuration                                 |
| Git init           | confirm | `true`        | Initialize git repository                                          |
| GitHub Actions     | select  | `ci`          | none, ci, ci+release                                               |
| Release mode       | select  | `tag`         | tag (recommended), commit (legacy), both; only shown if ci+release |
| Dependabot         | confirm | `true`        | Only if git + GitHub Actions enabled                               |
| Trusted publishing | confirm | `true`        | npm OIDC; only if ci+release and not deno                          |

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

- **Vite+ lint enabled** (default): `lint: vp lint` + `lint:fix: vp lint --fix`. No separate `typecheck` script because lint runs with type-aware type checking.
- **Vite+ lint disabled**: `typecheck: tsc --noEmit`, unless workspace root lint already owns checking.

Config uses `@kingsword/lint-config` through the Vite+ `lint` block in `vite.config.ts`. Do not generate standalone `oxlint.config.ts`, `.oxfmtrc.json`, or `tsdown.config.ts`.

## Release Modes

| Mode     | Trigger                                      | Use case                         |
| -------- | -------------------------------------------- | -------------------------------- |
| `tag`    | Push tag `v*.*.*`                            | Recommended for most projects    |
| `commit` | Push to `main` with `chore(release): vX.Y.Z` | Legacy convention                |
| `both`   | Either trigger                               | Migration or dual-workflow needs |

## After Scaffolding

```bash
cd my-project
pnpm run lint        # or npm/yarn/bun equivalent
```

The CLI auto-detects the installed package manager version and runs `install` during scaffolding. If the package manager is not found, install dependencies manually.

## Existing Projects

For existing projects:

- `npx frontpl oxlint` for Vite+ lint migration/addition
- `npx frontpl oxfmt` for Vite+ format migration/addition
