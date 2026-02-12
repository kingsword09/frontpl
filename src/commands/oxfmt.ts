import { cancel, confirm, intro, isCancel, outro, select, spinner } from "@clack/prompts";
import { unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { exec } from "../lib/exec.js";
import { writeText } from "../lib/fs.js";
import {
  type PackageJson,
  type PackageManager,
  detectPackageManager,
  readPackageJson,
  writePackageJson,
} from "../lib/project.js";
import { oxfmtConfigTemplate } from "../lib/templates.js";
import { pathExists } from "../lib/utils.js";

const OXFMT_SCRIPTS = {
  format: "oxfmt",
  "format:check": "oxfmt --check",
  fmt: "oxfmt",
  "fmt:check": "oxfmt --check",
} as const;

const PRETTIER_CONFIG_FILES = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.ts",
  ".prettierrc.cts",
  ".prettierrc.mts",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts",
  "prettier.config.cts",
  "prettier.config.mts",
] as const;

type CommandOptions = {
  yes?: boolean;
};

type ConfigMode = "migrate" | "rebuild";

type OxfmtConfigAction = "migrated" | "rebuilt" | "kept-existing";

type MigrationStats = {
  scriptsUpdated: string[];
  scriptsKept: string[];
  addedOxfmtDependency: boolean;
  removedPackageJsonPrettierConfig: boolean;
  removedDependencies: string[];
  removedConfigFiles: string[];
  oxfmtConfigAction: OxfmtConfigAction;
};

export async function runOxfmt({ yes = false }: CommandOptions = {}) {
  try {
    intro("frontpl (oxfmt)");

    const rootDir = process.cwd();
    const packageJsonPath = path.join(rootDir, "package.json");
    const oxfmtConfigPath = path.join(rootDir, ".oxfmtrc.json");

    const pkg = await readPackageJson(packageJsonPath);
    if (!pkg) {
      cancel("Missing package.json. Run this command in a Node project root.");
      process.exitCode = 1;
      return;
    }

    const packageManager = (await detectPackageManager(rootDir)) ?? "pnpm";
    const configMode = yes ? "rebuild" : await askConfigMode({ rootDir, pkg });

    const stats = await migrateToOxfmt({
      pkg,
      rootDir,
      oxfmtConfigPath,
      packageManager,
      configMode,
      yes,
    });

    await writePackageJson(packageJsonPath, pkg);

    const installOk = await maybeInstallDependencies({
      yes,
      packageManager,
      rootDir,
    });

    const scriptSummary =
      stats.scriptsUpdated.length > 0
        ? `updated scripts: ${stats.scriptsUpdated.join(", ")}`
        : stats.scriptsKept.length > 0
          ? `kept existing scripts: ${stats.scriptsKept.join(", ")}`
          : "scripts already aligned";

    const depSummary = stats.addedOxfmtDependency
      ? "added devDependency: oxfmt"
      : "devDependency oxfmt already present";

    const removedDepsSummary =
      stats.removedDependencies.length > 0
        ? `removed prettier deps: ${stats.removedDependencies.join(", ")}`
        : "no prettier deps removed";

    const removedPackageJsonPrettierSummary = stats.removedPackageJsonPrettierConfig
      ? "removed package.json#prettier"
      : "no package.json#prettier removed";

    const removedFilesSummary =
      stats.removedConfigFiles.length > 0
        ? `removed prettier config files: ${stats.removedConfigFiles.join(", ")}`
        : "no prettier config files removed";

    const configSummary =
      stats.oxfmtConfigAction === "migrated"
        ? "migrated .oxfmtrc.json from prettier"
        : stats.oxfmtConfigAction === "rebuilt"
          ? "rebuilt .oxfmtrc.json"
          : "kept existing .oxfmtrc.json";

    const installSummary =
      packageManager === "deno"
        ? "skipped dependency install (deno project)"
        : installOk === true
          ? `installed dependencies with ${packageManager}`
          : installOk === false
            ? `dependency install failed with ${packageManager}`
            : "skipped dependency install";

    outro(
      [
        "Done. Applied oxfmt migration.",
        `- ${scriptSummary}`,
        `- ${depSummary}`,
        `- ${removedDepsSummary}`,
        `- ${removedPackageJsonPrettierSummary}`,
        `- ${removedFilesSummary}`,
        `- ${configSummary}`,
        `- ${installSummary}`,
      ].join("\n"),
    );
  } catch (error) {
    if (error instanceof CancelledError) return;
    throw error;
  }
}

async function migrateToOxfmt(opts: {
  pkg: PackageJson;
  rootDir: string;
  oxfmtConfigPath: string;
  packageManager: PackageManager;
  configMode: ConfigMode;
  yes: boolean;
}): Promise<MigrationStats> {
  const { pkg, rootDir, oxfmtConfigPath, packageManager, configMode, yes } = opts;

  const scripts = { ...pkg.scripts };
  const conflictingScripts = Object.entries(OXFMT_SCRIPTS)
    .filter(([name, command]) => typeof scripts[name] === "string" && scripts[name] !== command)
    .map(([name]) => name);

  const shouldOverwriteConflicts =
    conflictingScripts.length === 0
      ? true
      : yes
        ? true
        : await askConfirm({
            message: `Overwrite conflicting scripts (${conflictingScripts.join(", ")}) with oxfmt?`,
            initialValue: true,
          });

  const scriptsUpdated: string[] = [];
  const scriptsKept: string[] = [];

  for (const [name, command] of Object.entries(OXFMT_SCRIPTS)) {
    const current = scripts[name];
    if (current === command) continue;
    if (current && !shouldOverwriteConflicts) {
      scriptsKept.push(name);
      continue;
    }
    scripts[name] = command;
    scriptsUpdated.push(name);
  }

  pkg.scripts = scripts;

  const devDependencies = { ...pkg.devDependencies };
  let addedOxfmtDependency = false;
  if (!devDependencies.oxfmt) {
    devDependencies.oxfmt = "latest";
    addedOxfmtDependency = true;
  }
  pkg.devDependencies = devDependencies;

  const removePrettier = yes
    ? true
    : await askConfirm({
        message: "Remove prettier dependencies and config files?",
        initialValue: true,
      });

  const removedDependencies: string[] = [];
  let removedPackageJsonPrettierConfig = false;
  if (removePrettier) {
    removedDependencies.push(...removePrettierDependencies(pkg, "dependencies"));
    removedDependencies.push(...removePrettierDependencies(pkg, "devDependencies"));
    removedPackageJsonPrettierConfig = removePrettierConfigFromPackageJson(pkg);
    cleanupEmptyDependencyBuckets(pkg);
  }

  const oxfmtConfigAction = await applyOxfmtConfig({
    rootDir,
    oxfmtConfigPath,
    packageManager,
    configMode,
    yes,
  });

  const removedConfigFiles: string[] = [];
  if (removePrettier) {
    for (const file of PRETTIER_CONFIG_FILES) {
      const filePath = path.join(rootDir, file);
      if (!(await pathExists(filePath))) continue;
      await unlink(filePath);
      removedConfigFiles.push(file);
    }
  }

  return {
    scriptsUpdated,
    scriptsKept,
    addedOxfmtDependency,
    removedPackageJsonPrettierConfig,
    removedDependencies,
    removedConfigFiles,
    oxfmtConfigAction,
  };
}

async function maybeInstallDependencies(opts: {
  yes: boolean;
  packageManager: PackageManager;
  rootDir: string;
}): Promise<boolean | undefined> {
  const { yes, packageManager, rootDir } = opts;
  if (packageManager === "deno") return undefined;

  const shouldInstall =
    yes ||
    (await askConfirm({
      message: `Install dependencies now with ${packageManager}?`,
      initialValue: true,
    }));

  if (!shouldInstall) return undefined;

  const installSpinner = spinner();
  installSpinner.start(`Installing dependencies with ${packageManager}`);
  const result = await exec(packageManager, ["install"], { cwd: rootDir });
  installSpinner.stop(result.ok ? "Dependencies installed" : "Dependency install failed");
  return result.ok;
}

async function askConfirm(opts: { message: string; initialValue: boolean }) {
  const answer = await confirm({
    message: opts.message,
    initialValue: opts.initialValue,
  });
  if (isCancel(answer)) return abort();
  return answer;
}

async function askConfigMode(opts: { rootDir: string; pkg: PackageJson }): Promise<ConfigMode> {
  const hasPrettierConfig = await detectPrettierConfig(opts.rootDir, opts.pkg);
  const mode = await select<ConfigMode>({
    message: "Prettier config strategy",
    initialValue: hasPrettierConfig ? "migrate" : "rebuild",
    options: [
      { value: "migrate", label: "Migrate from Prettier (oxfmt --migrate=prettier)" },
      { value: "rebuild", label: "Rebuild .oxfmtrc.json (current mode)" },
    ],
  });
  if (isCancel(mode)) return abort();
  return mode;
}

async function detectPrettierConfig(rootDir: string, pkg: PackageJson): Promise<boolean> {
  if (Object.prototype.hasOwnProperty.call(pkg, "prettier")) return true;
  for (const file of PRETTIER_CONFIG_FILES) {
    if (await pathExists(path.join(rootDir, file))) return true;
  }
  return false;
}

async function applyOxfmtConfig(opts: {
  rootDir: string;
  oxfmtConfigPath: string;
  packageManager: PackageManager;
  configMode: ConfigMode;
  yes: boolean;
}): Promise<OxfmtConfigAction> {
  const { rootDir, oxfmtConfigPath, packageManager, configMode, yes } = opts;

  const shouldOverwriteConfig =
    !(await pathExists(oxfmtConfigPath)) ||
    yes ||
    (await askConfirm({
      message:
        configMode === "migrate"
          ? "Overwrite existing .oxfmtrc.json via prettier migration?"
          : "Overwrite existing .oxfmtrc.json?",
      initialValue: true,
    }));

  if (!shouldOverwriteConfig) return "kept-existing";

  if (configMode === "migrate") {
    const migrateOk = await runOxfmtPrettierMigration({ rootDir, packageManager });
    if (migrateOk) return "migrated";

    const shouldFallbackToRebuild =
      yes ||
      (await askConfirm({
        message: "Migration failed. Rebuild .oxfmtrc.json with defaults instead?",
        initialValue: true,
      }));

    if (!shouldFallbackToRebuild) return "kept-existing";
  }

  await writeText(oxfmtConfigPath, oxfmtConfigTemplate());
  return "rebuilt";
}

async function runOxfmtPrettierMigration(opts: {
  rootDir: string;
  packageManager: PackageManager;
}): Promise<boolean> {
  const { rootDir, packageManager } = opts;

  const migrateSpinner = spinner();
  migrateSpinner.start("Migrating prettier config to .oxfmtrc.json");

  const directRun = await exec("oxfmt", ["--migrate=prettier"], { cwd: rootDir });
  if (directRun.ok) {
    migrateSpinner.stop("Migrated config with oxfmt");
    return true;
  }

  const fallbackRun =
    packageManager === "pnpm"
      ? await exec("pnpm", ["exec", "oxfmt", "--migrate=prettier"], { cwd: rootDir })
      : packageManager === "npm"
        ? await exec("npm", ["exec", "oxfmt", "--", "--migrate=prettier"], { cwd: rootDir })
        : packageManager === "yarn"
          ? await exec("yarn", ["dlx", "oxfmt", "--migrate=prettier"], { cwd: rootDir })
          : packageManager === "bun"
            ? await exec("bun", ["x", "oxfmt", "--migrate=prettier"], { cwd: rootDir })
            : { ok: false };

  migrateSpinner.stop(fallbackRun.ok ? "Migrated config with oxfmt" : "Prettier migration failed");
  return fallbackRun.ok;
}

function removePrettierDependencies(
  pkg: PackageJson,
  key: "dependencies" | "devDependencies",
): string[] {
  const bucket = pkg[key];
  if (!bucket) return [];

  const removed: string[] = [];
  for (const name of Object.keys(bucket)) {
    if (!isPrettierDependency(name)) continue;
    delete bucket[name];
    removed.push(name);
  }
  return removed;
}

function cleanupEmptyDependencyBuckets(pkg: PackageJson) {
  if (pkg.dependencies && Object.keys(pkg.dependencies).length === 0) {
    delete pkg.dependencies;
  }
  if (pkg.devDependencies && Object.keys(pkg.devDependencies).length === 0) {
    delete pkg.devDependencies;
  }
}

function removePrettierConfigFromPackageJson(pkg: PackageJson) {
  if (!Object.prototype.hasOwnProperty.call(pkg, "prettier")) return false;
  delete (pkg as PackageJson & { prettier?: unknown }).prettier;
  return true;
}

function isPrettierDependency(name: string) {
  return (
    name === "prettier" ||
    /(^|\/)prettier-plugin-/.test(name) ||
    name.startsWith("@prettier/plugin-")
  );
}

class CancelledError extends Error {
  constructor() {
    super("Cancelled");
  }
}

function abort(opts: { exitCode?: number; message?: string } = {}): never {
  cancel(opts.message ?? "Cancelled");
  process.exitCode = opts.exitCode ?? 0;
  throw new CancelledError();
}
