import { cancel, confirm, intro, isCancel, outro, text } from "@clack/prompts";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { detectPackageManagerVersion } from "../lib/versions.ts";
import {
  packageJsonTemplate,
  readmeTemplate,
  srcIndexTemplate,
  srcVitestTemplate,
  tsconfigTemplate,
  tsdownConfigTemplate,
} from "../lib/templates.ts";
import { detectPackageManager, readPackageJson } from "../lib/project.ts";
import { writeText } from "../lib/fs.ts";
import { pathExists } from "../lib/utils.ts";
import { validateProjectName } from "./init.ts";

type CommandOptions = {
  nameArg?: string;
  yes?: boolean;
};

export async function runAdd({ nameArg, yes = false }: CommandOptions = {}) {
  intro("frontpl (add)");

  const rootDir = process.cwd();
  const workspacePath = path.join(rootDir, "pnpm-workspace.yaml");
  if (!(await pathExists(workspacePath))) {
    cancel("Missing pnpm-workspace.yaml. This command only supports pnpm workspace roots.");
    process.exitCode = 1;
    return;
  }

  const rootPackageJsonPath = path.join(rootDir, "package.json");
  const rootPkg = await readPackageJson(rootPackageJsonPath);
  const detectedPm = await detectPackageManager(rootDir);
  const packageManagerField = rootPkg?.packageManager?.trim();
  const isPnpmWorkspace = packageManagerField?.startsWith("pnpm@") || detectedPm === "pnpm";

  if (!isPnpmWorkspace) {
    cancel("Only pnpm workspace projects are supported for `frontpl add`.");
    process.exitCode = 1;
    return;
  }

  const packageName =
    typeof nameArg === "string" && nameArg.trim().length > 0
      ? resolvePackageNameFromArg(nameArg)
      : await text({
          message: "Package name",
          initialValue: "my-package",
          validate: validateProjectName,
        });
  if (!packageName) return;
  if (isCancel(packageName)) return onCancel();

  const packageDir = path.join(rootDir, "packages", packageName);
  if (await pathExists(packageDir)) {
    cancel(`Package already exists: ${packageDir}`);
    process.exitCode = 1;
    return;
  }

  const useVitestDefault = typeof rootPkg?.scripts?.test === "string";
  const useTsdownDefault = typeof rootPkg?.scripts?.build === "string";

  const useVitest = yes
    ? useVitestDefault
    : await confirm({
        message: "Add Vitest?",
        initialValue: useVitestDefault,
      });
  if (isCancel(useVitest)) return onCancel();

  const useTsdown = yes
    ? useTsdownDefault
    : await confirm({
        message: "Add tsdown build?",
        initialValue: useTsdownDefault,
      });
  if (isCancel(useTsdown)) return onCancel();

  const resolvedPackageManagerField = await resolvePnpmPackageManagerField(packageManagerField);
  const rootHasOxlint =
    Boolean(rootPkg?.devDependencies?.oxlint) ||
    Boolean(rootPkg?.devDependencies?.["oxlint-tsgolint"]) ||
    (await pathExists(path.join(rootDir, "oxlint.config.ts")));

  const typescriptVersion = rootPkg?.devDependencies?.typescript ?? "latest";
  const vitestVersion = rootPkg?.devDependencies?.vitest ?? "latest";
  const tsdownVersion = rootPkg?.devDependencies?.tsdown ?? "latest";

  await mkdir(path.join(packageDir, "src"), { recursive: true });

  await Promise.all([
    writeText(path.join(packageDir, "README.md"), readmeTemplate(packageName)),
    writeText(path.join(packageDir, "src/index.ts"), srcIndexTemplate()),
    writeText(path.join(packageDir, "tsconfig.json"), tsconfigTemplate()),
    writeText(
      path.join(packageDir, "package.json"),
      packageJsonTemplate({
        name: packageName,
        packageManager: resolvedPackageManagerField,
        typescriptVersion,
        useOxlint: false,
        includeTypecheckWithoutOxlint: !rootHasOxlint,
        useOxfmt: false,
        useVitest,
        vitestVersion,
        useTsdown,
        tsdownVersion,
      }),
    ),
  ]);

  if (useVitest) {
    await writeText(path.join(packageDir, "src/index.test.ts"), srcVitestTemplate());
  }
  if (useTsdown) {
    await writeText(path.join(packageDir, "tsdown.config.ts"), tsdownConfigTemplate());
  }

  outro(
    [
      "Done. Added workspace package.",
      `- path: packages/${packageName}`,
      `- vitest: ${useVitest ? "enabled" : "disabled"}`,
      `- tsdown: ${useTsdown ? "enabled" : "disabled"}`,
    ].join("\n"),
  );
}

async function resolvePnpmPackageManagerField(existing: string | undefined) {
  if (existing?.startsWith("pnpm@")) return existing;
  const pnpmVersion = await detectPackageManagerVersion("pnpm");
  return pnpmVersion ? `pnpm@${pnpmVersion}` : "pnpm@latest";
}

function resolvePackageNameFromArg(nameArg: string): string | undefined {
  const value = nameArg.trim();
  const invalidReason = validateProjectName(value);
  if (invalidReason) {
    cancel(invalidReason);
    process.exitCode = 1;
    return;
  }
  return value;
}

function onCancel() {
  cancel("Cancelled");
  process.exitCode = 0;
}
