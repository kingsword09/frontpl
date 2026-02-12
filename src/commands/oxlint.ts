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
import { oxlintConfigTemplate } from "../lib/templates.js";
import { pathExists } from "../lib/utils.js";

const OXLINT_COMMAND = "oxlint --type-aware --type-check";
const OXLINT_FIX_COMMAND = `${OXLINT_COMMAND} --fix`;

const OXLINT_SCRIPTS = {
  lint: OXLINT_COMMAND,
  "lint:fix": OXLINT_FIX_COMMAND,
} as const;

const ESLINT_CONFIG_FILES = [
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.mjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
  ".eslintrc.ts",
  ".eslintrc.cts",
  ".eslintrc.mts",
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.mjs",
  "eslint.config.ts",
  "eslint.config.cts",
  "eslint.config.mts",
] as const;

const OXLINT_DEPENDENCIES = ["oxlint", "oxlint-tsgolint", "@kingsword/lint-config"] as const;

type CommandOptions = {
  yes?: boolean;
};

type MigrationStrategy = "migrate" | "replace";
type OxlintConfigAction = "written" | "kept-existing";

type MigrationStats = {
  strategy: MigrationStrategy;
  scriptsUpdated: string[];
  scriptsKept: string[];
  removedTypecheckScript: boolean;
  addedDevDependencies: string[];
  removedDependencies: string[];
  removedPackageJsonEslintConfig: boolean;
  removedConfigFiles: string[];
  oxlintConfigAction: OxlintConfigAction;
};

export async function runOxlint({ yes = false }: CommandOptions = {}) {
  try {
    intro("frontpl (oxlint)");

    const rootDir = process.cwd();
    const packageJsonPath = path.join(rootDir, "package.json");
    const oxlintConfigPath = path.join(rootDir, "oxlint.config.ts");

    const pkg = await readPackageJson(packageJsonPath);
    if (!pkg) {
      cancel("Missing package.json. Run this command in a Node project root.");
      process.exitCode = 1;
      return;
    }

    const packageManager = (await detectPackageManager(rootDir)) ?? "pnpm";
    const strategy = yes ? "replace" : await askMigrationStrategy({ rootDir, pkg });

    const stats = await migrateToOxlint({
      pkg,
      rootDir,
      oxlintConfigPath,
      strategy,
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

    const dependencySummary =
      stats.addedDevDependencies.length > 0
        ? `added devDependencies: ${stats.addedDevDependencies.join(", ")}`
        : "required oxlint devDependencies already present";

    const typecheckSummary = stats.removedTypecheckScript
      ? "removed redundant typecheck script (tsc --noEmit)"
      : "kept typecheck script";

    const eslintDependencySummary =
      stats.removedDependencies.length > 0
        ? `removed eslint deps: ${stats.removedDependencies.join(", ")}`
        : "no eslint deps removed";

    const eslintConfigSummary = stats.removedPackageJsonEslintConfig
      ? "removed package.json#eslintConfig"
      : "no package.json#eslintConfig removed";

    const eslintFileSummary =
      stats.removedConfigFiles.length > 0
        ? `removed eslint config files: ${stats.removedConfigFiles.join(", ")}`
        : "no eslint config files removed";

    const oxlintConfigSummary =
      stats.oxlintConfigAction === "written"
        ? "wrote oxlint.config.ts"
        : "kept existing oxlint.config.ts";

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
        "Done. Applied oxlint migration.",
        `- strategy: ${stats.strategy === "migrate" ? "migrate (keep ESLint assets)" : "replace ESLint assets"}`,
        `- ${scriptSummary}`,
        `- ${typecheckSummary}`,
        `- ${dependencySummary}`,
        `- ${eslintDependencySummary}`,
        `- ${eslintConfigSummary}`,
        `- ${eslintFileSummary}`,
        `- ${oxlintConfigSummary}`,
        `- ${installSummary}`,
      ].join("\n"),
    );
  } catch (error) {
    if (error instanceof CancelledError) return;
    throw error;
  }
}

async function migrateToOxlint(opts: {
  pkg: PackageJson;
  rootDir: string;
  oxlintConfigPath: string;
  strategy: MigrationStrategy;
  yes: boolean;
}): Promise<MigrationStats> {
  const { pkg, rootDir, oxlintConfigPath, strategy, yes } = opts;

  const scripts = { ...pkg.scripts };
  const conflictingScripts = Object.entries(OXLINT_SCRIPTS)
    .filter(([name, command]) => typeof scripts[name] === "string" && scripts[name] !== command)
    .map(([name]) => name);

  const shouldOverwriteConflicts =
    conflictingScripts.length === 0
      ? true
      : yes
        ? true
        : await askConfirm({
            message: `Overwrite conflicting scripts (${conflictingScripts.join(", ")}) with oxlint?`,
            initialValue: true,
          });

  const scriptsUpdated: string[] = [];
  const scriptsKept: string[] = [];

  for (const [name, command] of Object.entries(OXLINT_SCRIPTS)) {
    const current = scripts[name];
    if (current === command) continue;
    if (current && !shouldOverwriteConflicts) {
      scriptsKept.push(name);
      continue;
    }
    scripts[name] = command;
    scriptsUpdated.push(name);
  }

  let removedTypecheckScript = false;
  if (scripts.typecheck === "tsc --noEmit") {
    const shouldRemoveTypecheck =
      yes ||
      (await askConfirm({
        message: "Remove redundant typecheck script (tsc --noEmit)?",
        initialValue: true,
      }));
    if (shouldRemoveTypecheck) {
      delete scripts.typecheck;
      removedTypecheckScript = true;
    }
  }
  pkg.scripts = scripts;

  const devDependencies = { ...pkg.devDependencies };
  const addedDevDependencies: string[] = [];
  for (const dependency of OXLINT_DEPENDENCIES) {
    if (devDependencies[dependency]) continue;
    devDependencies[dependency] = "latest";
    addedDevDependencies.push(dependency);
  }
  pkg.devDependencies = devDependencies;

  const oxlintConfigAction = await applyOxlintConfig({
    pkg,
    oxlintConfigPath,
    yes,
  });

  let removedDependencies: string[] = [];
  let removedPackageJsonEslintConfig = false;
  const removedConfigFiles: string[] = [];

  if (strategy === "replace") {
    removedDependencies = [
      ...removeEslintDependencies(pkg, "dependencies"),
      ...removeEslintDependencies(pkg, "devDependencies"),
    ];
    removedPackageJsonEslintConfig = removeEslintConfigFromPackageJson(pkg);
    cleanupEmptyDependencyBuckets(pkg);

    for (const file of ESLINT_CONFIG_FILES) {
      const filePath = path.join(rootDir, file);
      if (!(await pathExists(filePath))) continue;
      await unlink(filePath);
      removedConfigFiles.push(file);
    }
  }

  return {
    strategy,
    scriptsUpdated,
    scriptsKept,
    removedTypecheckScript,
    addedDevDependencies,
    removedDependencies,
    removedPackageJsonEslintConfig,
    removedConfigFiles,
    oxlintConfigAction,
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

async function askMigrationStrategy(opts: {
  rootDir: string;
  pkg: PackageJson;
}): Promise<MigrationStrategy> {
  const hasEslintAssets = await detectEslintAssets(opts.rootDir, opts.pkg);
  const strategy = await select<MigrationStrategy>({
    message: "ESLint strategy",
    initialValue: hasEslintAssets ? "migrate" : "replace",
    options: [
      { value: "migrate", label: "Migrate gradually (keep ESLint assets)" },
      { value: "replace", label: "Replace ESLint directly (current mode)" },
    ],
  });
  if (isCancel(strategy)) return abort();
  return strategy;
}

async function detectEslintAssets(rootDir: string, pkg: PackageJson): Promise<boolean> {
  if (Object.prototype.hasOwnProperty.call(pkg, "eslintConfig")) return true;

  const dependencies = pkg.dependencies ?? {};
  const devDependencies = pkg.devDependencies ?? {};
  if (
    Object.keys(dependencies).some(isEslintDependency) ||
    Object.keys(devDependencies).some(isEslintDependency)
  ) {
    return true;
  }

  for (const file of ESLINT_CONFIG_FILES) {
    if (await pathExists(path.join(rootDir, file))) return true;
  }
  return false;
}

async function applyOxlintConfig(opts: {
  pkg: PackageJson;
  oxlintConfigPath: string;
  yes: boolean;
}): Promise<OxlintConfigAction> {
  const { pkg, oxlintConfigPath, yes } = opts;

  const shouldOverwriteConfig =
    !(await pathExists(oxlintConfigPath)) ||
    yes ||
    (await askConfirm({
      message: "Overwrite existing oxlint.config.ts?",
      initialValue: true,
    }));
  if (!shouldOverwriteConfig) return "kept-existing";

  const useVitest = detectUseVitest(pkg.scripts);
  await writeText(oxlintConfigPath, oxlintConfigTemplate({ useVitest }));
  return "written";
}

function detectUseVitest(scripts: Record<string, string> | undefined) {
  return typeof scripts?.test === "string" && scripts.test.includes("vitest");
}

function removeEslintDependencies(
  pkg: PackageJson,
  key: "dependencies" | "devDependencies",
): string[] {
  const bucket = pkg[key];
  if (!bucket) return [];

  const removed: string[] = [];
  for (const name of Object.keys(bucket)) {
    if (!isEslintDependency(name)) continue;
    delete bucket[name];
    removed.push(name);
  }
  return removed;
}

function isEslintDependency(name: string) {
  return (
    name === "eslint" ||
    name === "typescript-eslint" ||
    name.startsWith("@eslint/") ||
    name.startsWith("@typescript-eslint/") ||
    name.startsWith("eslint-") ||
    /(^|\/)eslint-(plugin|config|import-resolver)-/.test(name)
  );
}

function removeEslintConfigFromPackageJson(pkg: PackageJson) {
  if (!Object.prototype.hasOwnProperty.call(pkg, "eslintConfig")) return false;
  delete (pkg as PackageJson & { eslintConfig?: unknown }).eslintConfig;
  return true;
}

function cleanupEmptyDependencyBuckets(pkg: PackageJson) {
  if (pkg.dependencies && Object.keys(pkg.dependencies).length === 0) {
    delete pkg.dependencies;
  }
  if (pkg.devDependencies && Object.keys(pkg.devDependencies).length === 0) {
    delete pkg.devDependencies;
  }
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
