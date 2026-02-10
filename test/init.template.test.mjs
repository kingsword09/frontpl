import test from "node:test";
import assert from "node:assert/strict";

import {
  githubDependabotTemplate,
  oxlintConfigTemplate,
  packageJsonTemplate,
} from "../dist/index.mjs";
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

  assert.equal(pkg.scripts.typecheck, undefined);
  assert.equal(pkg.scripts.lint, "oxlint --type-aware --type-check");
  assert.equal(pkg.scripts["lint:fix"], "oxlint --type-aware --type-check --fix");
  assert.equal(pkg.devDependencies.oxlint, "latest");
  assert.equal(pkg.devDependencies["@kingsword/lint-config"], "^0.1.1");
  assert.equal(pkg.devDependencies["oxlint-tsgolint"], "latest");
});

void test("package template falls back to tsc typecheck when oxlint is disabled", () => {
  const pkgText = packageJsonTemplate({
    name: "demo-app",
    packageManager: "pnpm@10.28.1",
    typescriptVersion: "latest",
    useOxlint: false,
    useOxfmt: false,
    useVitest: false,
    useTsdown: false,
  });

  const pkg = JSON.parse(pkgText);

  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts.lint, undefined);
  assert.equal(pkg.devDependencies.oxlint, undefined);
  assert.equal(pkg.devDependencies["@kingsword/lint-config"], undefined);
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

  assert.match(
    workflow,
    /uses: kingsword09\/workflows\/.github\/workflows\/cli-ci\.yml@7320d30bcd47cee17cc2d8d28250ba1ab1f742b8 # v1\.0\.3/,
  );
  assert.match(workflow, /lintCommand: "pnpm run lint"/);
  assert.match(workflow, /formatCheckCommand: "pnpm run format:check"/);
  assert.match(workflow, /testCommand: "pnpm run test"/);
});

void test("ci template allows custom workflows ref and version", () => {
  const workflow = githubCliCiWorkflowTemplate({
    packageManager: "pnpm",
    nodeVersion: 22,
    workingDirectory: ".",
    runLint: true,
    runFormatCheck: false,
    runTests: false,
    workflowsRef: "deadbeef",
    workflowsVersion: "v9.9.9",
  });

  assert.match(workflow, /cli-ci\.yml@deadbeef # v9\.9\.9/);
});

void test("dependabot template maps root directory and includes groups", () => {
  const config = githubDependabotTemplate({
    packageManager: "pnpm",
    workingDirectory: ".",
  });

  assert.match(config, /package-ecosystem: "npm"/);
  assert.match(config, /directory: "\/"/);
  assert.match(config, /dependencies:/);
  assert.match(config, /github-actions:/);
});

void test("dependabot template maps monorepo package directory", () => {
  const config = githubDependabotTemplate({
    packageManager: "pnpm",
    workingDirectory: "packages/web",
  });

  assert.match(config, /directory: "\/packages\/web"/);
});

void test("dependabot template keeps github-actions updates for deno", () => {
  const config = githubDependabotTemplate({
    packageManager: "deno",
    workingDirectory: ".",
  });

  assert.doesNotMatch(config, /package-ecosystem: "npm"/);
  assert.match(config, /package-ecosystem: "github-actions"/);
});
