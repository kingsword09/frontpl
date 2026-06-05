# Lint Strategy Reference

## Decision Matrix

| `useOxlint`      | Scripts generated                           | Type checking                                     |
| ---------------- | ------------------------------------------- | ------------------------------------------------- |
| `true` (default) | `lint: vp lint` + `lint:fix: vp lint --fix` | Handled by Vite+ lint (no separate `typecheck`)   |
| `false`          | `typecheck: tsc --noEmit`                   | Handled by tsc unless root workspace lint owns it |

## Rationale

Vite+ lint delegates to oxlint with type-aware type checking through the `lint` block in `vite.config.ts`. Adding a separate `tsc --noEmit` script in the same generated package is redundant, except when Vite+ lint is disabled or package-level checking is not owned by the workspace root.

## Config File

When `useOxlint=true`, the generated or merged `vite.config.ts` contains a Vite+ `lint` block:

```typescript
import { defineConfig } from "vite-plus";
import { oxlint } from "@kingsword/lint-config/config";

export default defineConfig({
  lint: oxlint({
    profile: "lib",
    test: "vitest" | "none",
    level: "recommended",
    extra: {
      options: {
        typeAware: true,
        typeCheck: true,
      },
    },
  }),
});
```

The `test` parameter is `"vitest"` when vitest is enabled, `"none"` otherwise.

## CI Integration

CI workflows receive explicit lint commands via `with.lintCommand`. This avoids the reusable workflow having to guess the correct command. Generated Vite+ projects pass commands such as `pnpm run lint`, whose package script is `vp lint`.

```yaml
with:
  runLint: true
  lintCommand: "pnpm run lint"
```

For deno, commands are not passed (deno uses its own toolchain).

## Important Rules

1. Do not generate both root-managed `lint` and redundant package `typecheck` scripts.
2. Vite+ tool config lives in `vite.config.ts`; do not generate `oxlint.config.ts` or `.oxlintrc.json`.
3. `@kingsword/lint-config` is the required preset; do not use bare oxlint without it.

## Existing-project Migration (`frontpl oxlint`)

For existing projects, `frontpl oxlint` applies lint strategy with interactive migration:

- `init`: only create/update the `vite.config.ts` lint block
- `migrate`: keep ESLint assets, but add Vite+ lint scripts/config/dependencies
- `replace`: remove ESLint and legacy Oxlint assets, then switch fully to Vite+ lint

`replace` mode cleanup includes:

- `package.json#eslintConfig`
- ESLint deps/config packages (`eslint*`, `@eslint/*`, `@typescript-eslint/*`, etc.)
- `.eslintrc*` and `eslint.config.*`
- `.oxlintrc*` and `oxlint.config.*`

`--yes` mode defaults to `replace`.
