import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frontpl-package-"));
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

function runGit(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

void test("package command exits when package.json is missing", async () => {
  await withTempDir(async (dir) => {
    const result = runCli(dir, ["pkg", "--yes"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Missing package\.json/);
  });
});

void test("package command exits when remote is not github.com", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          name: "demo",
          private: true,
          packageManager: "pnpm@10.30.3",
          scripts: { build: "vp pack" },
        },
        null,
        2,
      ) + "\n",
    );
    assert.equal(runGit(dir, ["init"]).status, 0);
    assert.equal(
      runGit(dir, ["remote", "add", "origin", "https://gitlab.com/acme/demo.git"]).status,
      0,
    );

    const result = runCli(dir, ["pkg", "--yes"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Only github\.com remotes are supported/);
  });
});

void test("package command normalizes package.json using github remote", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          name: "demo-lib",
          private: true,
          packageManager: "pnpm@10.30.3",
          scripts: {
            build: "vp pack",
          },
        },
        null,
        2,
      ) + "\n",
    );
    assert.equal(runGit(dir, ["init"]).status, 0);
    assert.equal(
      runGit(dir, ["remote", "add", "origin", "git@github.com:acme/demo-lib.git"]).status,
      0,
    );

    const result = runCli(dir, ["pkg", "--yes"]);
    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    assert.equal(pkg.private, false);
    assert.equal(pkg.version, "0.0.0");
    assert.equal(pkg.license, "MIT");
    assert.equal(pkg.type, "module");
    assert.deepEqual(pkg.files, ["dist"]);
    assert.equal(pkg.main, "./dist/index.mjs");
    assert.equal(pkg.types, "./dist/index.d.mts");
    assert.equal(pkg.exports["."].types, "./dist/index.d.mts");
    assert.equal(pkg.exports["."].import, "./dist/index.mjs");
    assert.equal(pkg.exports["."].require, "./dist/index.mjs");
    assert.equal(pkg.homepage, "https://github.com/acme/demo-lib#readme");
    assert.equal(pkg.bugs.url, "https://github.com/acme/demo-lib/issues");
    assert.equal(pkg.repository.type, "git");
    assert.equal(pkg.repository.url, "git+https://github.com/acme/demo-lib.git");
    assert.equal(pkg.repository.directory, undefined);
    assert.equal(pkg.publishConfig.access, "public");
    assert.equal(pkg.engines.node, ">=22.12.0");
    assert.equal(pkg.scripts.prepublishOnly, "pnpm run build");
  });
});

void test("package command preserves existing license", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          name: "demo-lib",
          private: true,
          license: "Apache-2.0",
          packageManager: "pnpm@10.30.3",
          scripts: {
            build: "vp pack",
          },
        },
        null,
        2,
      ) + "\n",
    );
    assert.equal(runGit(dir, ["init"]).status, 0);
    assert.equal(
      runGit(dir, ["remote", "add", "origin", "git@github.com:acme/demo-lib.git"]).status,
      0,
    );

    const result = runCli(dir, ["pkg", "--yes"]);
    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    assert.equal(pkg.license, "Apache-2.0");
  });
});

void test("package command writes repository.directory in monorepo subpackage", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          name: "repo",
          private: true,
          packageManager: "pnpm@10.30.3",
        },
        null,
        2,
      ) + "\n",
    );
    assert.equal(runGit(dir, ["init"]).status, 0);
    assert.equal(
      runGit(dir, ["remote", "add", "origin", "https://github.com/acme/mono.git"]).status,
      0,
    );

    const packageDir = path.join(dir, "packages", "web");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      path.join(packageDir, "package.json"),
      JSON.stringify(
        {
          name: "web",
          private: true,
          scripts: {
            build: "vp pack",
          },
        },
        null,
        2,
      ) + "\n",
    );

    const result = runCli(packageDir, ["pkg", "--yes"]);
    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));
    assert.equal(pkg.repository.url, "git+https://github.com/acme/mono.git");
    assert.equal(pkg.repository.directory, "packages/web");
    assert.equal(pkg.scripts.prepublishOnly, "pnpm run build");
  });
});
