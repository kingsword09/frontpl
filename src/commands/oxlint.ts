import { cancel, confirm, intro, isCancel, outro, select, spinner } from "@clack/prompts";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { exec } from "../lib/exec.ts";
import { writeText } from "../lib/fs.ts";
import {
  type PackageJson,
  type PackageManager,
  detectPackageManager,
  readPackageJson,
  writePackageJson,
} from "../lib/project.ts";
import { mergeVitePlusConfigTemplate, vitePlusConfigTemplate } from "../lib/templates.ts";
import { pathExists } from "../lib/utils.ts";

const OXLINT_COMMAND = "vp lint";
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

const OXLINT_CONFIG_FILES = [
  ".oxlintrc",
  ".oxlintrc.json",
  ".oxlintrc.yaml",
  ".oxlintrc.yml",
  "oxlint.config.js",
  "oxlint.config.cjs",
  "oxlint.config.mjs",
  "oxlint.config.ts",
  "oxlint.config.cts",
  "oxlint.config.mts",
] as const;

const OXLINT_DEPENDENCIES = ["vite-plus", "oxlint", "@kingsword/lint-config"] as const;
const OXLINT_LEGACY_DEPENDENCIES = ["oxlint-tsgolint"] as const;

type CommandOptions = {
  yes?: boolean;
  init?: boolean;
};

type OxlintMode = "init" | "migrate" | "replace";
type OxlintConfigAction = "written" | "updated" | "kept-existing";

type MigrationStats = {
  strategy: Exclude<OxlintMode, "init">;
  scriptsUpdated: string[];
  scriptsKept: string[];
  removedTypecheckScript: boolean;
  addedDevDependencies: string[];
  removedDependencies: string[];
  removedPackageJsonEslintConfig: boolean;
  removedConfigFiles: string[];
  oxlintConfigAction: OxlintConfigAction;
};

export async function runOxlint({ yes = false, init = false }: CommandOptions = {}) {
  try {
    intro("frontpl (oxlint)");

    const rootDir = process.cwd();
    const packageJsonPath = path.join(rootDir, "package.json");
    const viteConfigPath = path.join(rootDir, "vite.config.ts");

    const pkg = await readPackageJson(packageJsonPath);
    if (!pkg) {
      cancel("Missing package.json. Run this command in a Node project root.");
      process.exitCode = 1;
      return;
    }

    const packageManager = (await detectPackageManager(rootDir)) ?? "pnpm";
    const mode = init ? "init" : yes ? "replace" : await askOxlintMode({ rootDir, pkg });

    if (mode === "init") {
      const oxlintConfigAction = await applyOxlintConfig({
        pkg,
        viteConfigPath,
        yes,
      });

      outro(
        [
          "Done. Initialized Vite+ lint config.",
          `- ${formatViteConfigAction(oxlintConfigAction)}`,
          "- package.json and dependencies left unchanged",
        ].join("\n"),
      );
      return;
    }

    const stats = await migrateToOxlint({
      pkg,
      rootDir,
      viteConfigPath,
      strategy: mode,
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
        : "required Vite+ lint devDependencies already present";

    const typecheckSummary = stats.removedTypecheckScript
      ? "removed redundant typecheck script (tsc --noEmit)"
      : "kept typecheck script";

    const eslintDependencySummary =
      stats.removedDependencies.length > 0
        ? `removed lint deps: ${stats.removedDependencies.join(", ")}`
        : "no lint deps removed";

    const eslintConfigSummary = stats.removedPackageJsonEslintConfig
      ? "removed package.json#eslintConfig"
      : "no package.json#eslintConfig removed";

    const eslintFileSummary =
      stats.removedConfigFiles.length > 0
        ? `removed eslint config files: ${stats.removedConfigFiles.join(", ")}`
        : "no eslint config files removed";

    const oxlintConfigSummary = formatViteConfigAction(stats.oxlintConfigAction);

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
        "Done. Applied Vite+ lint migration.",
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
  viteConfigPath: string;
  strategy: Exclude<OxlintMode, "init">;
  yes: boolean;
}): Promise<MigrationStats> {
  const { pkg, rootDir, viteConfigPath, strategy, yes } = opts;

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
            message: `Overwrite conflicting scripts (${conflictingScripts.join(", ")}) with Vite+ lint?`,
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
  const removedLegacyDependencies: string[] = [];
  for (const dependency of OXLINT_DEPENDENCIES) {
    if (devDependencies[dependency]) continue;
    devDependencies[dependency] = "latest";
    addedDevDependencies.push(dependency);
  }
  for (const dependency of OXLINT_LEGACY_DEPENDENCIES) {
    if (!devDependencies[dependency]) continue;
    delete devDependencies[dependency];
    removedLegacyDependencies.push(dependency);
  }
  pkg.devDependencies = devDependencies;

  const oxlintConfigAction = await applyOxlintConfig({
    pkg,
    viteConfigPath,
    yes,
  });

  let removedDependencies: string[] = removedLegacyDependencies;
  let removedPackageJsonEslintConfig = false;
  const removedConfigFiles: string[] = [];

  if (strategy === "replace") {
    removedDependencies = [
      ...removedDependencies,
      ...removeEslintDependencies(pkg, "dependencies"),
      ...removeEslintDependencies(pkg, "devDependencies"),
    ];
    removedPackageJsonEslintConfig = removeEslintConfigFromPackageJson(pkg);
    cleanupEmptyDependencyBuckets(pkg);

    for (const file of [...ESLINT_CONFIG_FILES, ...OXLINT_CONFIG_FILES]) {
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

async function askOxlintMode(opts: { rootDir: string; pkg: PackageJson }): Promise<OxlintMode> {
  const hasEslintAssets = await detectEslintAssets(opts.rootDir, opts.pkg);
  const hasViteConfig = await pathExists(path.join(opts.rootDir, "vite.config.ts"));
  const mode = await select<OxlintMode>({
    message: "Vite+ lint mode",
    initialValue:
      !hasViteConfig && detectExistingOxlintSetup(opts.pkg)
        ? "init"
        : hasEslintAssets
          ? "migrate"
          : "replace",
    options: [
      { value: "init", label: "Initialize vite.config.ts lint block only" },
      { value: "migrate", label: "Migrate gradually (keep ESLint assets)" },
      { value: "replace", label: "Replace ESLint directly (current mode)" },
    ],
  });
  if (isCancel(mode)) return abort();
  return mode;
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
  viteConfigPath: string;
  yes: boolean;
}): Promise<OxlintConfigAction> {
  const { pkg, viteConfigPath, yes } = opts;

  const shouldOverwriteConfig =
    !(await pathExists(viteConfigPath)) ||
    yes ||
    (await askConfirm({
      message: "Update existing vite.config.ts with Vite+ lint config?",
      initialValue: true,
    }));
  if (!shouldOverwriteConfig) return "kept-existing";

  const useVitest = detectUseVitest(pkg.scripts);
  if (!(await pathExists(viteConfigPath))) {
    await writeText(
      viteConfigPath,
      vitePlusConfigTemplate({
        useOxlint: true,
        useOxfmt: false,
        useVitest,
        useTsdown: false,
      }),
    );
    return "written";
  }

  const current = await readFile(viteConfigPath, "utf8");
  const next = mergeVitePlusConfigTemplate(current, {
    useOxlint: true,
    useOxfmt: false,
    useVitest,
    useTsdown: false,
  });
  if (next === current) return "kept-existing";
  await writeText(viteConfigPath, next);
  return "updated";
}

function formatViteConfigAction(action: OxlintConfigAction) {
  return action === "written"
    ? "wrote vite.config.ts"
    : action === "updated"
      ? "updated vite.config.ts"
      : "kept existing vite.config.ts";
}

function detectUseVitest(scripts: Record<string, string> | undefined) {
  return typeof scripts?.test === "string" && scripts.test.includes("vitest");
}

function detectExistingOxlintSetup(pkg: PackageJson) {
  return (
    pkg.scripts?.lint === OXLINT_COMMAND ||
    pkg.scripts?.["lint:fix"] === OXLINT_FIX_COMMAND ||
    Boolean(
      pkg.dependencies?.["vite-plus"] ||
      pkg.devDependencies?.["vite-plus"] ||
      pkg.dependencies?.oxlint ||
      pkg.devDependencies?.oxlint ||
      pkg.devDependencies?.["oxlint-tsgolint"] ||
      pkg.devDependencies?.["@kingsword/lint-config"],
    )
  );
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
