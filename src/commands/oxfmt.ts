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

const OXFMT_COMMAND = "vp fmt";
const OXFMT_CHECK_COMMAND = `${OXFMT_COMMAND} --check`;

const OXFMT_SCRIPTS = {
  format: OXFMT_COMMAND,
  "format:check": OXFMT_CHECK_COMMAND,
} as const;

const OXFMT_LEGACY_SCRIPTS = {
  fmt: ["oxfmt", OXFMT_COMMAND],
  "fmt:check": ["oxfmt --check", OXFMT_CHECK_COMMAND],
} as const;

const OXFMT_CONFIG_FILES = [".oxfmtrc.json"] as const;

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

const OXFMT_DEPENDENCIES = ["vite-plus"] as const;

type CommandOptions = {
  yes?: boolean;
  init?: boolean;
};

type OxfmtMode = "init" | "migrate" | "replace";
type ViteConfigAction = "written" | "updated" | "kept-existing";

type MigrationStats = {
  strategy: Exclude<OxfmtMode, "init">;
  scriptsUpdated: string[];
  scriptsKept: string[];
  removedLegacyScripts: string[];
  addedDevDependencies: string[];
  removedPackageJsonPrettierConfig: boolean;
  removedDependencies: string[];
  removedConfigFiles: string[];
  viteConfigAction: ViteConfigAction;
};

export async function runOxfmt({ yes = false, init = false }: CommandOptions = {}) {
  try {
    intro("frontpl (oxfmt)");

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
    const mode = init ? "init" : yes ? "replace" : await askOxfmtMode({ rootDir, pkg });

    if (mode === "init") {
      const viteConfigAction = await applyOxfmtConfig({
        viteConfigPath,
        yes,
      });

      outro(
        [
          "Done. Initialized Vite+ format config.",
          `- ${formatViteConfigAction(viteConfigAction)}`,
          "- package.json and dependencies left unchanged",
        ].join("\n"),
      );
      return;
    }

    const stats = await migrateToOxfmt({
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
    const legacyScriptSummary =
      stats.removedLegacyScripts.length > 0
        ? `removed legacy scripts: ${stats.removedLegacyScripts.join(", ")}`
        : "no legacy scripts removed";

    const depSummary =
      stats.addedDevDependencies.length > 0
        ? `added devDependencies: ${stats.addedDevDependencies.join(", ")}`
        : "required Vite+ format devDependencies already present";

    const removedDepsSummary =
      stats.removedDependencies.length > 0
        ? `removed formatter deps: ${stats.removedDependencies.join(", ")}`
        : "no formatter deps removed";

    const removedPackageJsonPrettierSummary = stats.removedPackageJsonPrettierConfig
      ? "removed package.json#prettier"
      : "no package.json#prettier removed";

    const removedFilesSummary =
      stats.removedConfigFiles.length > 0
        ? `removed formatter config files: ${stats.removedConfigFiles.join(", ")}`
        : "no formatter config files removed";

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
        "Done. Applied Vite+ format migration.",
        `- strategy: ${stats.strategy === "migrate" ? "migrate (keep Prettier assets)" : "replace Prettier assets"}`,
        `- ${scriptSummary}`,
        `- ${legacyScriptSummary}`,
        `- ${depSummary}`,
        `- ${removedDepsSummary}`,
        `- ${removedPackageJsonPrettierSummary}`,
        `- ${removedFilesSummary}`,
        `- ${formatViteConfigAction(stats.viteConfigAction)}`,
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
  viteConfigPath: string;
  strategy: Exclude<OxfmtMode, "init">;
  yes: boolean;
}): Promise<MigrationStats> {
  const { pkg, rootDir, viteConfigPath, strategy, yes } = opts;

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
            message: `Overwrite conflicting scripts (${conflictingScripts.join(", ")}) with Vite+ format?`,
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

  const removedLegacyScripts: string[] = [];
  for (const [name, commands] of Object.entries(OXFMT_LEGACY_SCRIPTS)) {
    if (!commands.some((command) => scripts[name] === command)) continue;
    delete scripts[name];
    removedLegacyScripts.push(name);
  }

  pkg.scripts = scripts;

  const devDependencies = { ...pkg.devDependencies };
  const addedDevDependencies: string[] = [];
  for (const dependency of OXFMT_DEPENDENCIES) {
    if (pkg.dependencies?.[dependency] || devDependencies[dependency]) continue;
    devDependencies[dependency] = "latest";
    addedDevDependencies.push(dependency);
  }
  pkg.devDependencies = devDependencies;

  const removedDependencies = [
    ...removeNamedDependency(pkg, "dependencies", "oxfmt"),
    ...removeNamedDependency(pkg, "devDependencies", "oxfmt"),
  ];

  let removedPackageJsonPrettierConfig = false;
  if (strategy === "replace") {
    removedDependencies.push(...removePrettierDependencies(pkg, "dependencies"));
    removedDependencies.push(...removePrettierDependencies(pkg, "devDependencies"));
    removedPackageJsonPrettierConfig = removePrettierConfigFromPackageJson(pkg);
  }
  cleanupEmptyDependencyBuckets(pkg);

  const viteConfigAction = await applyOxfmtConfig({
    viteConfigPath,
    yes,
  });

  const removedConfigFiles: string[] = [];
  if (strategy === "replace") {
    for (const file of [...PRETTIER_CONFIG_FILES, ...OXFMT_CONFIG_FILES]) {
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
    removedLegacyScripts,
    addedDevDependencies,
    removedPackageJsonPrettierConfig,
    removedDependencies,
    removedConfigFiles,
    viteConfigAction,
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

async function askOxfmtMode(opts: { rootDir: string; pkg: PackageJson }): Promise<OxfmtMode> {
  const hasPrettierAssets = await detectPrettierAssets(opts.rootDir, opts.pkg);
  const hasViteConfig = await pathExists(path.join(opts.rootDir, "vite.config.ts"));
  const mode = await select<OxfmtMode>({
    message: "Vite+ format mode",
    initialValue:
      !hasViteConfig && detectExistingOxfmtSetup(opts.pkg)
        ? "init"
        : hasPrettierAssets
          ? "migrate"
          : "replace",
    options: [
      { value: "init", label: "Initialize vite.config.ts fmt block only" },
      { value: "migrate", label: "Migrate gradually (keep Prettier assets)" },
      { value: "replace", label: "Replace Prettier directly (current mode)" },
    ],
  });
  if (isCancel(mode)) return abort();
  return mode;
}

async function detectPrettierAssets(rootDir: string, pkg: PackageJson): Promise<boolean> {
  if (Object.prototype.hasOwnProperty.call(pkg, "prettier")) return true;

  const dependencies = pkg.dependencies ?? {};
  const devDependencies = pkg.devDependencies ?? {};
  if (
    Object.keys(dependencies).some(isPrettierDependency) ||
    Object.keys(devDependencies).some(isPrettierDependency)
  ) {
    return true;
  }

  for (const file of PRETTIER_CONFIG_FILES) {
    if (await pathExists(path.join(rootDir, file))) return true;
  }
  return false;
}

async function applyOxfmtConfig(opts: {
  viteConfigPath: string;
  yes: boolean;
}): Promise<ViteConfigAction> {
  const { viteConfigPath, yes } = opts;

  const shouldOverwriteConfig =
    !(await pathExists(viteConfigPath)) ||
    yes ||
    (await askConfirm({
      message: "Update existing vite.config.ts with Vite+ format config?",
      initialValue: true,
    }));

  if (!shouldOverwriteConfig) return "kept-existing";

  if (!(await pathExists(viteConfigPath))) {
    await writeText(
      viteConfigPath,
      vitePlusConfigTemplate({
        useOxlint: false,
        useOxfmt: true,
        useVitest: false,
        useTsdown: false,
      }),
    );
    return "written";
  }

  const current = await readFile(viteConfigPath, "utf8");
  const next = mergeVitePlusConfigTemplate(current, {
    useOxlint: false,
    useOxfmt: true,
    useVitest: false,
    useTsdown: false,
  });
  if (next === current) return "kept-existing";
  await writeText(viteConfigPath, next);
  return "updated";
}

function formatViteConfigAction(action: ViteConfigAction) {
  return action === "written"
    ? "wrote vite.config.ts"
    : action === "updated"
      ? "updated vite.config.ts"
      : "kept existing vite.config.ts";
}

function removeNamedDependency(
  pkg: PackageJson,
  key: "dependencies" | "devDependencies",
  name: string,
): string[] {
  const bucket = pkg[key];
  if (!bucket?.[name]) return [];
  delete bucket[name];
  return [name];
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

function detectExistingOxfmtSetup(pkg: PackageJson) {
  return (
    pkg.scripts?.format === OXFMT_SCRIPTS.format ||
    pkg.scripts?.["format:check"] === OXFMT_SCRIPTS["format:check"] ||
    pkg.scripts?.format === "oxfmt" ||
    pkg.scripts?.["format:check"] === "oxfmt --check" ||
    pkg.scripts?.fmt === "oxfmt" ||
    pkg.scripts?.["fmt:check"] === "oxfmt --check" ||
    pkg.scripts?.fmt === OXFMT_COMMAND ||
    pkg.scripts?.["fmt:check"] === OXFMT_CHECK_COMMAND ||
    Boolean(
      pkg.dependencies?.["vite-plus"] ||
      pkg.devDependencies?.["vite-plus"] ||
      pkg.dependencies?.oxfmt ||
      pkg.devDependencies?.oxfmt,
    )
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
