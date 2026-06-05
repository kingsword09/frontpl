import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI_PATH = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "frontpl-add-"));
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

void test("add command exits when pnpm workspace config is missing", async () => {
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

    const result = runCli(dir, ["add", "TalentPrism", "--yes"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Missing pnpm-workspace\.yaml/);
  });
});

void test("add command exits when workspace is not pnpm", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          name: "repo",
          private: true,
          packageManager: "npm@11.4.2",
        },
        null,
        2,
      ) + "\n",
    );

    const result = runCli(dir, ["add", "TalentPrism", "--yes"]);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /Only pnpm workspace projects are supported/,
    );
  });
});

void test("add command scaffolds package in pnpm workspace", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    await writeFile(
      path.join(dir, "package.json"),
      JSON.stringify(
        {
          name: "repo",
          private: true,
          packageManager: "pnpm@10.30.3",
          scripts: {
            lint: "vp lint",
            test: "vp run -r test",
            build: "vp run -r build",
          },
          devDependencies: {
            oxlint: "^1.47.0",
            typescript: "^5.9.3",
            "vite-plus": "^0.1.24",
          },
        },
        null,
        2,
      ) + "\n",
    );

    const result = runCli(dir, ["add", "TalentPrism", "--yes"]);
    assert.equal(result.status, 0);

    const pkg = JSON.parse(
      await readFile(path.join(dir, "packages", "TalentPrism", "package.json"), "utf8"),
    );
    assert.equal(pkg.name, "TalentPrism");
    assert.equal(pkg.packageManager, "pnpm@10.30.3");
    assert.equal(pkg.scripts.typecheck, undefined);
    assert.equal(pkg.scripts.test, "vp test");
    assert.equal(pkg.scripts.build, "vp pack");
    assert.equal(pkg.scripts.lint, undefined);
    assert.equal(pkg.scripts.format, undefined);
    assert.equal(pkg.devDependencies.typescript, "^5.9.3");
    assert.equal(pkg.devDependencies["vite-plus"], "^0.1.24");
    assert.equal(pkg.devDependencies.vitest, undefined);
    assert.equal(pkg.devDependencies.tsdown, undefined);

    await stat(path.join(dir, "packages", "TalentPrism", "README.md"));
    await stat(path.join(dir, "packages", "TalentPrism", "src", "index.ts"));
    await stat(path.join(dir, "packages", "TalentPrism", "src", "index.test.ts"));
    await stat(path.join(dir, "packages", "TalentPrism", "tsconfig.json"));
    const viteConfig = await readFile(
      path.join(dir, "packages", "TalentPrism", "vite.config.ts"),
      "utf8",
    );
    assert.match(viteConfig, /import \{ defineConfig \} from "vite-plus"/);
    assert.match(viteConfig, /test: \{/);
    assert.match(viteConfig, /pack: \{/);
  });
});

void test("add command exits when package already exists", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
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
    await mkdir(path.join(dir, "packages", "TalentPrism"), { recursive: true });
    await writeFile(path.join(dir, "packages", "TalentPrism", "package.json"), "{}\n");

    const result = runCli(dir, ["add", "TalentPrism", "--yes"]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Package already exists/);
  });
});
