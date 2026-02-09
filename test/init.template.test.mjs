import test from "node:test";
import assert from "node:assert/strict";

import { oxlintConfigTemplate, packageJsonTemplate } from "../dist/index.mjs";
import { githubCliCiWorkflowTemplate } from "../dist/index.mjs";

void test("oxlint template uses @kingsword/lint-config", () => {
  const cfg = oxlintConfigTemplate({ useVitest: false });
  assert.match(cfg, /import \{ defineConfig \} from "oxlint";/);
  assert.match(cfg, /import \{ oxlint \} from "@kingsword\/lint-config\/config";/);
  assert.match(cfg, /profile: "lib"/);
  assert.match(cfg, /test: "none"/);
  assert.match(cfg, /level: "recommended"/);
});

void test("package template adds kingsword lint dependency", () => {
  const pkgText = packageJsonTemplate({
    name: "demo-app",
    packageManager: "pnpm@10.28.1",
    typescriptVersion: "latest",
    useOxlint: true,
    oxlintVersion: "latest",
    oxlintTsgolintVersion: "latest",
    kingswordLintConfigVersion: "^0.1.1",
    useOxfmt: false,
    useVitest: true,
    vitestVersion: "latest",
    useTsdown: false,
  });

  const pkg = JSON.parse(pkgText);

  assert.equal(pkg.scripts.lint, "oxlint --type-aware --type-check");
  assert.equal(pkg.scripts["lint:fix"], "oxlint --type-aware --type-check --fix");
  assert.equal(pkg.devDependencies.oxlint, "latest");
  assert.equal(pkg.devDependencies["@kingsword/lint-config"], "^0.1.1");
  assert.equal(pkg.devDependencies["oxlint-tsgolint"], "latest");
});

void test("ci template can pin explicit run commands", () => {
  const workflow = githubCliCiWorkflowTemplate({
    packageManager: "pnpm",
    nodeVersion: 22,
    workingDirectory: ".",
    runLint: true,
    runFormatCheck: true,
    runTests: true,
    lintCommand: "pnpm run lint",
    formatCheckCommand: "pnpm run format:check",
    testCommand: "pnpm run test",
  });

  assert.match(workflow, /lintCommand: "pnpm run lint"/);
  assert.match(workflow, /formatCheckCommand: "pnpm run format:check"/);
  assert.match(workflow, /testCommand: "pnpm run test"/);
});
