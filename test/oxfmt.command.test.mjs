import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frontpl-oxfmt-"));
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

void test("oxfmt command migrates scripts and removes prettier assets", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          name: "demo-app",
          version: "1.0.0",
          private: true,
          packageManager: "deno@2.2.0",
          prettier: {
            semi: false,
          },
          scripts: {
            format: "prettier . --write",
            "format:check": "prettier . --check",
            lint: "eslint .",
          },
          dependencies: {
            "prettier-plugin-tailwindcss": "^0.6.8",
          },
          devDependencies: {
            prettier: "^3.4.0",
            oxfmt: "^0.31.0",
          },
        },
        null,
        2,
      ) + "\n",
    );

    await writeFile(path.join(dir, ".prettierrc"), "{}\n");
    await writeFile(path.join(dir, ".prettierrc.toml"), "semi = false\n");
    await writeFile(path.join(dir, "prettier.config.cjs"), "module.exports = {};\n");
    await writeFile(path.join(dir, "prettier.config.ts"), "export default {};\n");

    const result = runCli(dir, ["oxfmt", "--yes"]);

    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    assert.equal(pkg.scripts.format, "oxfmt");
    assert.equal(pkg.scripts["format:check"], "oxfmt --check");
    assert.equal(pkg.scripts.fmt, "oxfmt");
    assert.equal(pkg.scripts["fmt:check"], "oxfmt --check");
    assert.equal(pkg.scripts.lint, "eslint .");
    assert.equal(pkg.devDependencies.oxfmt, "^0.31.0");
    assert.equal(pkg.devDependencies.prettier, undefined);
    assert.equal(pkg.prettier, undefined);
    assert.equal(pkg.dependencies?.["prettier-plugin-tailwindcss"], undefined);

    await stat(path.join(dir, ".oxfmtrc.json"));
    await assert.rejects(stat(path.join(dir, ".prettierrc")));
    await assert.rejects(stat(path.join(dir, ".prettierrc.toml")));
    await assert.rejects(stat(path.join(dir, "prettier.config.cjs")));
    await assert.rejects(stat(path.join(dir, "prettier.config.ts")));
  });
});

void test("oxfmt command exits when package.json is missing", async () => {
  await withTempDir(async (dir) => {
    const result = runCli(dir, ["oxfmt", "--yes"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Missing package\.json/);
  });
});
