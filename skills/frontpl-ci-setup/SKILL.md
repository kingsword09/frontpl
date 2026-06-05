---
name: frontpl-ci-setup
description: Add or update GitHub Actions CI/release workflows and Dependabot config to existing frontend projects via the frontpl CLI. Use when the user wants to add CI pipelines, set up GitHub Actions, add release automation, configure Dependabot, or generate reusable workflow integrations for an existing project. Triggers on requests like "add CI to my project", "set up GitHub Actions workflows", "add release workflow", or "configure Dependabot".
metadata:
  author: kingsword09
  version: "0.3.2"
---

# Add CI Workflows with frontpl

## Quick Start

```bash
cd /path/to/existing/project
npx frontpl ci
```

Run inside an existing project directory. The CLI auto-detects the project setup and guides through interactive prompts.

## Auto-Detection

The `ci` command detects:

| Item              | Detection method                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package manager   | `package.json#packageManager` field, then lockfile presence (`pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`/`bun.lock`, `deno.json`) |
| Working directory | Scans root + `packages/*` + `apps/*` for `package.json`; selects automatically if only one candidate                                                  |
| Node.js version   | `.nvmrc` > `.node-version` > `package.json#engines.node` > defaults to 22                                                                             |
| CI commands       | Detects `lint`, `format:check`/`fmt:check`, `test` scripts in the target package.json                                                                 |

frontpl-generated Vite+ projects use scripts such as `vp lint`, `vp fmt --check`, and `vp test`; CI writes explicit workflow inputs (`lintCommand`, `formatCheckCommand`, `testCommand`) instead of relying on reusable-workflow inference.

## Interactive Prompts

| Prompt             | Type    | Default                 | Notes                                            |
| ------------------ | ------- | ----------------------- | ------------------------------------------------ |
| Package manager    | select  | auto-detected           | npm, yarn, pnpm, bun, deno                       |
| Working directory  | select  | auto-detected           | Only shown if multiple candidates found          |
| Node.js version    | text    | auto-detected           | Major version for GitHub Actions matrix          |
| Run lint           | confirm | `true` if script exists | Prompts for custom command if no script detected |
| Run format check   | confirm | `true` if script exists | Detects both `format:check` and `fmt:check`      |
| Run tests          | confirm | `true` if script exists | Prompts for custom command if no script detected |
| Release workflow   | confirm | `true`                  | Tag push (recommended), commit, or both          |
| Trusted publishing | confirm | `true`                  | npm OIDC; not shown for deno                     |
| Dependabot         | confirm | `true`                  | Only if `.git` directory exists                  |

## Generated Files

```
.github/
├── workflows/
│   ├── ci.yml            # Always generated
│   └── release.yml       # If release enabled
└── dependabot.yml         # If Dependabot enabled
```

Existing files prompt for overwrite confirmation before being replaced.

## Workflow Architecture

All generated workflows call **reusable workflows** from `kingsword09/workflows`, pinned to a specific commit SHA for reproducibility:

- **CI**: `cli-ci.yml` — lint, format check, test steps with explicit commands
- **Release (tag)**: `cli-release-tag.yml` — triggers on `v*.*.*` tag push (recommended)
- **Release (commit)**: `cli-release.yml` — triggers on `main` push with `chore(release): vX.Y.Z` message
- **Release (both)**: Combined workflow routing via `if: startsWith(github.ref, ...)`

## Release Modes

| Mode     | Trigger                                      | Use case                         |
| -------- | -------------------------------------------- | -------------------------------- |
| `tag`    | Push tag `v*.*.*`                            | Recommended for most projects    |
| `commit` | Push to `main` with `chore(release): vX.Y.Z` | Legacy convention                |
| `both`   | Either trigger                               | Migration or dual-workflow needs |

## Dependabot Config

Generated Dependabot config includes:

- **npm dependencies group** (weekly, Monday 03:00 PT, max 10 PRs) — skipped for deno
- **github-actions group** (weekly, same schedule)
- Correct `directory` mapping for monorepos (e.g., `packages/web` becomes `/packages/web`)
