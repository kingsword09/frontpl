# Development Reference

## Architecture

```
src/
├── cli.ts              # Entry point (tiny-bin). Routes to commands.
├── index.ts            # Public API exports for library consumers.
├── commands/
│   ├── init.ts         # frontpl [name] / frontpl init [name]
│   ├── add.ts          # frontpl add
│   ├── ci.ts           # frontpl ci
│   ├── oxlint.ts       # frontpl oxlint
│   ├── oxfmt.ts        # frontpl oxfmt
│   ├── bump.ts         # frontpl bump
│   └── package.ts      # frontpl pkg
└── lib/
    ├── templates.ts    # All template generators (pure functions, no side effects)
    ├── fs.ts           # writeText(), readJsonFile()
    ├── exec.ts         # Spawn child processes (handles Windows .cmd)
    ├── project.ts      # package.json read/write + package manager detection
    ├── utils.ts        # pathExists()
    └── versions.ts     # detectPackageManagerVersion()
```

Key separation: **commands** handle user interaction + orchestration; **templates** are pure string generators; **lib** handles I/O.

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

## Lint Strategy

| `useOxlint`      | Scripts generated                           | Type checking                                     |
| ---------------- | ------------------------------------------- | ------------------------------------------------- |
| `true` (default) | `lint: vp lint` + `lint:fix: vp lint --fix` | Handled by Vite+ lint (no separate `typecheck`)   |
| `false`          | `typecheck: tsc --noEmit`                   | Handled by tsc unless root workspace lint owns it |

Rules:

1. Do not generate both root-managed `lint` and redundant package `typecheck` scripts.
2. Vite+ tool config lives in `vite.config.ts`; do not generate `oxlint.config.ts`, `.oxfmtrc.json`, or `tsdown.config.ts`.
3. `@kingsword/lint-config` is the required preset.
4. CI workflows pin to commit SHA (`DEFAULT_WORKFLOWS_REF` in `templates.ts`) with a version comment.

## Existing-project Migration Commands

- `frontpl oxlint`
  - Strategy: `init` (only `vite.config.ts` lint block) / `migrate` (keep ESLint assets) / `replace` (remove ESLint and legacy Oxlint assets)
  - `--yes` default: `replace`
- `frontpl oxfmt`
  - Strategy: `init` (only `vite.config.ts` fmt block) / `migrate` (keep Prettier assets) / `replace` (remove Prettier and legacy Oxfmt assets)
  - `--yes` default: `replace`

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

## Key Types

```typescript
type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
type GithubActionsPreset = "none" | "ci" | "ci+release";
type GithubReleaseMode = "tag" | "commit" | "both";
```
