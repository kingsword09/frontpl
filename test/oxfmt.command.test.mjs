import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const INDEX_URL = new URL("../dist/index.mjs", import.meta.url).href;

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

function runOxfmtInit(cwd) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { runOxfmt } from ${JSON.stringify(INDEX_URL)}; process.chdir(${JSON.stringify(cwd)}); await runOxfmt({ yes: true, init: true });`,
    ],
    {
      cwd,
      encoding: "utf8",
    },
  );
}

void test("oxfmt command migrates scripts and writes Vite+ format config", async () => {
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
            fmt: "oxfmt",
            "fmt:check": "oxfmt --check",
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
    await writeFile(path.join(dir, ".oxfmtrc.json"), "{}\n");
    await writeFile(path.join(dir, "prettier.config.cjs"), "module.exports = {};\n");
    await writeFile(path.join(dir, "prettier.config.ts"), "export default {};\n");

    const result = runCli(dir, ["oxfmt", "--yes"]);

    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    assert.equal(pkg.scripts.format, "vp fmt");
    assert.equal(pkg.scripts["format:check"], "vp fmt --check");
    assert.equal(pkg.scripts.fmt, undefined);
    assert.equal(pkg.scripts["fmt:check"], undefined);
    assert.equal(pkg.scripts.lint, "eslint .");
    assert.equal(pkg.devDependencies["vite-plus"], "latest");
    assert.equal(pkg.devDependencies.oxfmt, undefined);
    assert.equal(pkg.devDependencies.prettier, undefined);
    assert.equal(pkg.prettier, undefined);
    assert.equal(pkg.dependencies?.["prettier-plugin-tailwindcss"], undefined);

    const config = await readFile(path.join(dir, "vite.config.ts"), "utf8");
    assert.match(config, /from "vite-plus"/);
    assert.match(config, /fmt: \{/);
    assert.match(config, /lineWidth: 100/);
    assert.match(config, /trailingComma: "all"/);
    await assert.rejects(stat(path.join(dir, ".prettierrc")));
    await assert.rejects(stat(path.join(dir, ".prettierrc.toml")));
    await assert.rejects(stat(path.join(dir, ".oxfmtrc.json")));
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

void test("oxfmt --init only writes Vite+ format config", async () => {
  await withTempDir(async (dir) => {
    const initialPackageJson =
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
          },
          devDependencies: {
            oxfmt: "^0.36.0",
            prettier: "^3.4.0",
          },
        },
        null,
        2,
      ) + "\n";

    await writeFile(path.join(dir, "package.json"), initialPackageJson);
    await writeFile(path.join(dir, ".prettierrc"), "{}\n");

    const result = runOxfmtInit(dir);
    assert.equal(result.status, 0);

    assert.equal(await readFile(path.join(dir, "package.json"), "utf8"), initialPackageJson);
    assert.equal(await readFile(path.join(dir, ".prettierrc"), "utf8"), "{}\n");

    const config = await readFile(path.join(dir, "vite.config.ts"), "utf8");
    assert.match(config, /from "vite-plus"/);
    assert.match(config, /fmt: \{/);
    assert.match(config, /lineWidth: 100/);
    await assert.rejects(stat(path.join(dir, ".oxfmtrc.json")));
  });
});
