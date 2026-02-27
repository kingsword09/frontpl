import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frontpl-bump-"));
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

void test("bump command exits when package.json is missing", async () => {
  await withTempDir(async (dir) => {
    const result = runCli(dir, ["bump", "patch"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Missing package\.json/);
  });
});

void test("bump patch increases patch by one", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "demo", version: "1.2.3" }, null, 2) + "\n",
    );

    const result = runCli(dir, ["bump", "patch"]);
    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    assert.equal(pkg.version, "1.2.4");
  });
});

void test("bump minor increases minor and resets patch", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "demo", version: "1.2.9" }, null, 2) + "\n",
    );

    const result = runCli(dir, ["bump", "minor"]);
    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    assert.equal(pkg.version, "1.3.0");
  });
});

void test("bump major increases major and resets minor/patch", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "demo", version: "1.9.9" }, null, 2) + "\n",
    );

    const result = runCli(dir, ["bump", "major"]);
    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    assert.equal(pkg.version, "2.0.0");
  });
});

void test("bump supports explicit version target", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "demo", version: "1.0.0" }, null, 2) + "\n",
    );

    const result = runCli(dir, ["bump", "3.4.5"]);
    assert.equal(result.status, 0);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    assert.equal(pkg.version, "3.4.5");
  });
});

void test("bump dry-run previews next version without writing file", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "demo", version: "1.2.3" }, null, 2) + "\n",
    );

    const result = runCli(dir, ["bump", "minor", "--dry-run"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Dry run\. Calculated package\.json version update\./);
    assert.match(result.stdout, /- from: 1\.2\.3/);
    assert.match(result.stdout, /- to: 1\.3\.0/);
    assert.match(result.stdout, /- mode: minor/);

    const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    assert.equal(pkg.version, "1.2.3");
  });
});

void test("bump patch fails when current version is invalid", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "demo", version: "next" }, null, 2) + "\n",
    );

    const result = runCli(dir, ["bump", "patch"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /missing or invalid for bump mode/i);
  });
});

void test("bump fails when explicit version is invalid", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "demo", version: "1.0.0" }, null, 2) + "\n",
    );

    const result = runCli(dir, ["bump", "v2"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Invalid version/);
  });
});
