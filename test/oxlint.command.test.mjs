import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frontpl-oxlint-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: "utf8",
  });
}

void test("oxlint command replaces eslint scripts/assets and writes oxlint config", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          name: "demo-app",
          version: "1.0.0",
          private: true,
          packageManager: "deno@2.2.0",
          eslintConfig: {
            root: true,
          },
          scripts: {
            lint: "eslint .",
            "lint:fix": "eslint . --fix",
            typecheck: "tsc --noEmit",
            test: "vitest",
          },
          dependencies: {
            "@next/eslint-plugin-next": "^15.1.0",
          },
          devDependencies: {
            eslint: "^9.20.0",
            "@typescript-eslint/eslint-plugin": "^8.20.0",
          },
        },
        null,
        2,
      ) + "\n",
    );

    await writeFile(path.join(dir, ".eslintrc.json"), "{}\n");
    await writeFile(path.join(dir, "eslint.config.mts"), "export default [];\n");

    const result = runCli(dir, ["oxlint", "--yes"]);
    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));

    assert.equal(pkg.scripts.lint, "oxlint --type-aware --type-check");
    assert.equal(pkg.scripts["lint:fix"], "oxlint --type-aware --type-check --fix");
    assert.equal(pkg.scripts.typecheck, undefined);
    assert.equal(pkg.scripts.test, "vitest");

    assert.equal(pkg.devDependencies.oxlint, "latest");
    assert.equal(pkg.devDependencies["oxlint-tsgolint"], "latest");
    assert.equal(pkg.devDependencies["@kingsword/lint-config"], "latest");

    assert.equal(pkg.devDependencies.eslint, undefined);
    assert.equal(pkg.devDependencies["@typescript-eslint/eslint-plugin"], undefined);
    assert.equal(pkg.dependencies?.["@next/eslint-plugin-next"], undefined);
    assert.equal(pkg.eslintConfig, undefined);

    const config = await readFile(path.join(dir, "oxlint.config.ts"), "utf8");
    assert.match(config, /@kingsword\/lint-config\/config/);
    assert.match(config, /test: "vitest"/);

    await assert.rejects(stat(path.join(dir, ".eslintrc.json")));
    await assert.rejects(stat(path.join(dir, "eslint.config.mts")));
  });
});

void test("oxlint command exits when package.json is missing", async () => {
  await withTempDir(async (dir) => {
    const result = runCli(dir, ["oxlint", "--yes"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Missing package\.json/);
  });
});
