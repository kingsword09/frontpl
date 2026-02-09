# frontpl / AGENTS.md

适用范围：仓库根目录及其全部子目录。

## 核心原则（强制）

- **KISS**：优先最小改动与直接实现，避免过度设计。
- **YAGNI**：只实现当前确定需求，不预埋不必要能力。
- **DRY**：模板、命令、提示文案优先复用，避免重复逻辑。
- **SOLID（重点 SRP/OCP）**：CLI 入口、命令逻辑、模板生成、I/O 分层清晰。

## 仓库技术约定（强制）

- 运行时：Node `>=22`。
- 模块形态：TypeScript + ESM（NodeNext）。
- 包管理：`pnpm`（保持 `pnpm-lock.yaml` 为唯一锁文件）。
- 命令入口：`src/cli.ts`。
- 命令实现：`src/commands/*`。
- 模板集中：`src/lib/templates.ts`（避免散落）。

## Lint 约定（强制）

1. 默认采用 `@kingsword/lint-config` + `oxlint.config.ts`。
2. 当 `useOxlint=true`（默认）时：
   - 使用 `lint: oxlint --type-aware --type-check`
   - 使用 `lint:fix: oxlint --type-aware --type-check --fix`
   - 不额外生成 `typecheck: tsc --noEmit`（避免重复检查）
3. 当 `useOxlint=false` 时：
   - 回退为 `typecheck: tsc --noEmit`
4. 不回退到旧的 `.oxlintrc.json` 方案。

## CI 生成约定（强制）

- `init` / `ci` 生成 CI 工作流时，若脚本存在，应显式写入：
  - `lintCommand`
  - `formatCheckCommand`
  - `testCommand`
- 目标是减少 reusable workflow 的隐式推断，保证行为稳定。

## 文档同步（强制）

涉及以下变更时必须同步 `README.md`：

- 初始化交互行为
- 生成文件清单
- lint/typecheck 策略
- CI/Release 行为

## 变更后验证（建议）

1. `pnpm run format:check`
2. `pnpm run typecheck`
3. `pnpm run build`
4. `pnpm run lint`
5. `node --test test/init.template.test.mjs`

## PR 合并门禁（精简）

1. 以上验证全通过。
2. 模板行为变更有对应测试断言更新。
3. README 与实际生成行为一致。
