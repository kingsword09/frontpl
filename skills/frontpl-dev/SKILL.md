---
name: frontpl-dev
description: Develop and contribute to the frontpl CLI codebase. Use when working on frontpl source code, adding new templates, adding CLI commands, fixing bugs, or extending functionality. Covers architecture, template conventions, lint strategy, testing, and code patterns for the frontpl project at github.com/kingsword09/frontpl.
metadata:
  author: kingsword09
  version: "0.3.2"
---

# frontpl Development Guide

## Architecture Overview

```
src/
├── cli.ts              # Entry point (tiny-bin). Routes to commands.
├── index.ts            # Public API exports for library consumers.
├── commands/
│   ├── init.ts         # `frontpl [name]` / `frontpl init [name]` - scaffold new project
│   ├── add.ts          # `frontpl add` - add package to an existing pnpm workspace
│   ├── ci.ts           # `frontpl ci` - add CI workflows to existing project
│   ├── oxlint.ts       # `frontpl oxlint` - add/migrate Vite+ lint
│   ├── oxfmt.ts        # `frontpl oxfmt` - add/migrate Vite+ format
│   ├── bump.ts         # `frontpl bump` - bump package.json version
│   └── package.ts      # `frontpl pkg` - normalize package.json for npm publishing
└── lib/
    ├── templates.ts    # All template generators (pure functions, no side effects)
    ├── fs.ts           # writeText(), readJsonFile()
    ├── exec.ts         # Spawn child processes (handles Windows .cmd)
    ├── project.ts      # package.json read/write + package manager detection
    ├── utils.ts        # pathExists()
    └── versions.ts     # detectPackageManagerVersion()
```

Key separation: **commands** handle user interaction + orchestration; **templates** are pure string generators; **lib** handles I/O.

## Core Conventions

1. **Templates are pure functions** in `src/lib/templates.ts`. No file I/O, no side effects. Accept an options object, return a string.
2. **Vite+ tooling**: generated lint, format, test, and pack settings live in `vite.config.ts`; do not generate standalone `oxlint.config.ts`, `.oxfmtrc.json`, or `tsdown.config.ts`.
3. **Lint strategy**: when `useOxlint=true`, generate `lint: vp lint` and `lint:fix: vp lint --fix`. When `false`, generate `typecheck: tsc --noEmit` unless root workspace lint owns checking. See [references/lint-strategy.md](references/lint-strategy.md).
4. **CI workflows pin to commit SHA** with a version comment. Default ref and version are constants at the top of `templates.ts` (`DEFAULT_WORKFLOWS_REF`, `DEFAULT_WORKFLOWS_VERSION`).
5. **Package managers**: all 5 supported (npm, pnpm, yarn, bun, deno). Command migrations use `detectPackageManager()` from `project.ts` and optional install via `exec()`.
6. **New templates** must be exported from both `templates.ts` and `index.ts`.

## Adding a New Template

1. Add a pure function to `src/lib/templates.ts`:
   ```typescript
   export function myNewTemplate(opts: { ... }) {
     return [/* lines */].join("\n");
   }
   ```
2. Export from `src/index.ts`.
3. Add test assertions in `test/init.template.test.mjs`.
4. Use in the relevant command (`init.ts`, `add.ts`, `ci.ts`, `oxlint.ts`, `oxfmt.ts`, `bump.ts`, `package.ts`).

## Adding a New Command

1. Create `src/commands/<name>.ts` with an exported `async function run<Name>()`.
2. Register in `src/cli.ts` via tiny-bin.
3. Use `@clack/prompts` for interactive prompts (text, select, confirm).
4. Handle cancellation: check `isCancel()` after every prompt.

## Validation Workflow

Run in order:

```bash
pnpm run format:check    # vp fmt --check
pnpm run typecheck       # vp check --no-fmt --no-lint
pnpm run build           # vp pack
pnpm run lint            # vp lint
node --test test/init.template.test.mjs
node --test test/oxlint.command.test.mjs
node --test test/oxfmt.command.test.mjs
```

## Key Type Definitions

```typescript
type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
type GithubActionsPreset = "none" | "ci" | "ci+release";
type GithubReleaseMode = "tag" | "commit" | "both";
```

## Tech Stack

| Tool                            | Purpose                                   |
| ------------------------------- | ----------------------------------------- |
| TypeScript + ESM (NodeNext)     | Language & module system                  |
| tiny-bin                        | CLI framework                             |
| @clack/prompts                  | Interactive TUI prompts                   |
| Vite+                           | Tool orchestration for pack/lint/fmt/test |
| oxlint + @kingsword/lint-config | Vite+ lint with type-aware checks         |
| Oxfmt                           | Vite+ format engine                       |
| Node test runner                | Unit tests (no external test framework)   |

## References

- [Lint strategy details](references/lint-strategy.md) - Vite+ lint vs tsc conventions
- [AGENTS.md](../../AGENTS.md) — Enforced project conventions
