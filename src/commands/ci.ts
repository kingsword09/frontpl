import { cancel, confirm, intro, isCancel, outro, select, text } from "@clack/prompts";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { writeText } from "../lib/fs.js";
import {
  githubCliCiWorkflowTemplate,
  githubCliReleaseBothWorkflowTemplate,
  githubCliReleaseTagWorkflowTemplate,
  githubCliReleaseWorkflowTemplate,
  githubDependabotTemplate,
} from "../lib/templates.js";
import { pathExists } from "../lib/utils.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
type GithubReleaseMode = "tag" | "commit" | "both";

type PackageJson = {
  packageManager?: string;
  scripts?: Record<string, string>;
  engines?: { node?: string };
};

export async function runCi() {
  try {
    intro("frontpl (ci)");

    const rootDir = process.cwd();

    const detectedPackageManager = await detectPackageManager(rootDir);
    const packageManager = await select<PackageManager>({
      message: detectedPackageManager
        ? `Package manager (detected: ${detectedPackageManager})`
        : "Package manager",
      initialValue: detectedPackageManager ?? "pnpm",
      options: [
        { value: "npm", label: "npm" },
        { value: "yarn", label: "yarn" },
        { value: "pnpm", label: "pnpm" },
        { value: "bun", label: "bun" },
        { value: "deno", label: "deno" },
      ],
    });
    if (isCancel(packageManager)) return abort();

    const candidates = await listPackageCandidates(rootDir, packageManager);
    if (candidates.length === 0) {
      cancel(
        "No package found. Run this command in a project root (with package.json or deno.json).",
      );
      process.exitCode = 1;
      return;
    }

    const initialWorkingDirectory = await detectWorkingDirectory(rootDir, candidates);
    const workingDirectory =
      candidates.length === 1
        ? candidates[0]!
        : await select<string>({
            message: "Working directory (package folder)",
            initialValue: initialWorkingDirectory,
            options: candidates.map((c) => ({ value: c, label: c })),
          });
    if (isCancel(workingDirectory)) return abort();

    const nodeVersionDefault = (await detectNodeMajorVersion(rootDir)) ?? 22;
    const nodeVersionText = await text({
      message: "Node.js major version (for GitHub Actions)",
      initialValue: String(nodeVersionDefault),
      validate: (value) => {
        const major = Number.parseInt(value.trim(), 10);
        if (!Number.isFinite(major) || major <= 0) return "Enter a valid major version (e.g. 22)";
        return;
      },
    });
    if (isCancel(nodeVersionText)) return abort();
    const nodeVersion = Number.parseInt(String(nodeVersionText).trim(), 10);

    const { runLint, runFormatCheck, runTests, lintCommand, formatCheckCommand, testCommand } =
      await resolveCiCommands(rootDir, workingDirectory, packageManager);

    const addRelease = await confirm({
      message: "Add release workflow too?",
      initialValue: true,
    });
    if (isCancel(addRelease)) return abort();

    const releaseMode = addRelease
      ? await select<GithubReleaseMode>({
          message: "Release workflows",
          initialValue: "tag",
          options: [
            { value: "tag", label: "Tag push (vX.Y.Z) — recommended" },
            { value: "commit", label: "Release commit (chore(release): vX.Y.Z) — legacy" },
            { value: "both", label: "Both (tag + commit)" },
          ],
        })
      : undefined;
    if (isCancel(releaseMode)) return abort();

    const trustedPublishing =
      addRelease && packageManager !== "deno"
        ? await confirm({
            message: "Release: npm trusted publishing (OIDC)?",
            initialValue: true,
          })
        : undefined;
    if (isCancel(trustedPublishing)) return abort();

    const hasGitRepo = await pathExists(path.join(rootDir, ".git"));
    const addDependabot = hasGitRepo
      ? await confirm({
          message: "Add/update Dependabot config (.github/dependabot.yml)?",
          initialValue: true,
        })
      : false;
    if (isCancel(addDependabot)) return abort();

    const ciWorkflowPath = path.join(rootDir, ".github/workflows/ci.yml");
    const releaseWorkflowPath = path.join(rootDir, ".github/workflows/release.yml");
    const dependabotPath = path.join(rootDir, ".github/dependabot.yml");

    const shouldWriteCi = await confirmOverwriteIfExists(
      ciWorkflowPath,
      ".github/workflows/ci.yml",
    );
    if (!shouldWriteCi) {
      cancel("Skipped CI workflow");
      process.exitCode = 0;
      return;
    }

    await writeText(
      ciWorkflowPath,
      githubCliCiWorkflowTemplate({
        packageManager,
        nodeVersion,
        workingDirectory,
        runLint,
        runFormatCheck,
        runTests,
        lintCommand,
        formatCheckCommand,
        testCommand,
      }),
    );

    if (addRelease) {
      const shouldWriteRelease = await confirmOverwriteIfExists(
        releaseWorkflowPath,
        ".github/workflows/release.yml",
      );
      if (shouldWriteRelease) {
        await writeText(
          releaseWorkflowPath,
          (releaseMode === "both"
            ? githubCliReleaseBothWorkflowTemplate
            : releaseMode === "commit"
              ? githubCliReleaseWorkflowTemplate
              : githubCliReleaseTagWorkflowTemplate)({
            packageManager,
            nodeVersion,
            workingDirectory,
            trustedPublishing,
          }),
        );
      }
    }

    if (addDependabot) {
      const shouldWriteDependabot = await confirmOverwriteIfExists(
        dependabotPath,
        ".github/dependabot.yml",
      );
      if (shouldWriteDependabot) {
        await writeText(
          dependabotPath,
          githubDependabotTemplate({
            packageManager,
            workingDirectory,
          }),
        );
      }
    }

    outro(
      addRelease
        ? "Done. Generated CI + release workflows (and optional Dependabot)."
        : "Done. Generated CI workflow (and optional Dependabot).",
    );
  } catch (err) {
    if (err instanceof CancelledError) return;
    throw err;
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

async function confirmOverwriteIfExists(absPath: string, label: string) {
  if (!(await pathExists(absPath))) return true;
  const overwrite = await confirm({
    message: `Overwrite existing ${label}?`,
    initialValue: true,
  });
  if (isCancel(overwrite)) return abort();
  return overwrite;
}

function isPackageManager(value: string): value is PackageManager {
  return (
    value === "npm" || value === "pnpm" || value === "yarn" || value === "bun" || value === "deno"
  );
}

async function detectPackageManager(rootDir: string): Promise<PackageManager | undefined> {
  const pkg = await readPackageJson(path.join(rootDir, "package.json"));
  const pmField = pkg?.packageManager;
  if (pmField) {
    const pm = pmField.split("@")[0] ?? "";
    if (isPackageManager(pm)) return pm;
  }

  const candidates: PackageManager[] = [];
  if (await pathExists(path.join(rootDir, "pnpm-lock.yaml"))) candidates.push("pnpm");
  if (await pathExists(path.join(rootDir, "yarn.lock"))) candidates.push("yarn");
  if (await pathExists(path.join(rootDir, "package-lock.json"))) candidates.push("npm");
  if (await pathExists(path.join(rootDir, "bun.lockb"))) candidates.push("bun");
  if (
    (await pathExists(path.join(rootDir, "deno.json"))) ||
    (await pathExists(path.join(rootDir, "deno.jsonc")))
  )
    candidates.push("deno");

  return candidates.length === 1 ? candidates[0] : undefined;
}

async function listPackageCandidates(
  rootDir: string,
  packageManager: PackageManager,
): Promise<string[]> {
  const candidates = new Set<string>();

  if (await pathExists(path.join(rootDir, "package.json"))) candidates.add(".");
  if (
    packageManager === "deno" &&
    ((await pathExists(path.join(rootDir, "deno.json"))) ||
      (await pathExists(path.join(rootDir, "deno.jsonc"))))
  ) {
    candidates.add(".");
  }

  for (const base of ["packages", "apps"]) {
    const baseDir = path.join(rootDir, base);
    if (!(await pathExists(baseDir))) continue;
    const entries = await readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packageJsonPath = path.join(baseDir, entry.name, "package.json");
      if (await pathExists(packageJsonPath)) {
        candidates.add(path.posix.join(base, entry.name));
      }
    }
  }

  return [...candidates];
}

async function detectWorkingDirectory(rootDir: string, candidates: string[]): Promise<string> {
  if (candidates.length === 1) return candidates[0]!;
  const rootPkg = await readPackageJson(path.join(rootDir, "package.json"));
  const rootScripts = rootPkg?.scripts ?? {};
  const rootHasScripts = Object.keys(rootScripts).length > 0;

  const nonRoot = candidates.filter((c) => c !== ".");
  if (!rootHasScripts && nonRoot.length === 1) return nonRoot[0]!;

  return ".";
}

async function detectNodeMajorVersion(rootDir: string): Promise<number | undefined> {
  for (const file of [".nvmrc", ".node-version"]) {
    const filePath = path.join(rootDir, file);
    if (!(await pathExists(filePath))) continue;
    const line = (await readFile(filePath, "utf8")).split("\n")[0]?.trim() ?? "";
    const major = parseMajorVersion(line);
    if (major) return major;
  }

  const pkg = await readPackageJson(path.join(rootDir, "package.json"));
  const engine = pkg?.engines?.node;
  if (!engine) return;
  const match = engine.match(/([0-9]{2,})/);
  if (!match) return;
  return Number.parseInt(match[1]!, 10);
}

function parseMajorVersion(input: string): number | undefined {
  const trimmed = input.trim().replace(/^v/, "");
  const major = Number.parseInt(trimmed.split(".")[0] ?? "", 10);
  if (!Number.isFinite(major) || major <= 0) return;
  return major;
}

async function resolveCiCommands(
  rootDir: string,
  workingDirectory: string,
  packageManager: PackageManager,
): Promise<{
  runLint: boolean;
  runFormatCheck: boolean;
  runTests: boolean;
  lintCommand?: string;
  formatCheckCommand?: string;
  testCommand?: string;
}> {
  if (packageManager === "deno") {
    return { runLint: true, runFormatCheck: true, runTests: true };
  }

  const pkg = await readPackageJson(path.join(rootDir, workingDirectory, "package.json"));
  if (!pkg) {
    return abort({ message: `Missing package.json in ${workingDirectory}`, exitCode: 1 });
  }

  const scripts = pkg.scripts ?? {};

  const hasLint = typeof scripts.lint === "string";
  const hasTest = typeof scripts.test === "string";
  const hasFormatCheck = typeof scripts["format:check"] === "string";
  const hasFmtCheck = typeof scripts["fmt:check"] === "string";

  const runLintDefault = hasLint;
  const runFormatCheckDefault = hasFormatCheck || hasFmtCheck;
  const runTestsDefault = hasTest;

  const runLint = await confirm({
    message: `CI: run lint${hasLint ? "" : " (no lint script detected)"}`,
    initialValue: runLintDefault,
  });
  if (isCancel(runLint)) return abort();

  const runFormatCheck = await confirm({
    message: `CI: run format check${runFormatCheckDefault ? "" : " (no format check script detected)"}`,
    initialValue: runFormatCheckDefault,
  });
  if (isCancel(runFormatCheck)) return abort();

  const runTests = await confirm({
    message: `CI: run tests${hasTest ? "" : " (no test script detected)"}`,
    initialValue: runTestsDefault,
  });
  if (isCancel(runTests)) return abort();

  const lintCommand =
    runLint && hasLint
      ? pmRun(packageManager, "lint")
      : runLint
        ? await promptCommand("Lint command", pmRun(packageManager, "lint"))
        : undefined;

  const formatCheckCommand =
    runFormatCheck && hasFormatCheck
      ? pmRun(packageManager, "format:check")
      : runFormatCheck && hasFmtCheck
        ? pmRun(packageManager, "fmt:check")
        : runFormatCheck
          ? await promptCommand("Format check command", pmRun(packageManager, "format:check"))
          : undefined;

  const testCommand =
    runTests && hasTest
      ? pmRun(packageManager, "test")
      : runTests
        ? await promptCommand("Test command", pmRun(packageManager, "test"))
        : undefined;

  return {
    runLint,
    runFormatCheck,
    runTests,
    lintCommand,
    formatCheckCommand,
    testCommand,
  };
}

async function promptCommand(message: string, initialValue: string): Promise<string> {
  const value = await text({
    message,
    initialValue,
    validate: (v) => (!v.trim() ? "Command is required" : undefined),
  });
  if (isCancel(value)) return abort();
  return String(value).trim();
}

function pmRun(pm: PackageManager, script: string) {
  switch (pm) {
    case "npm":
      return `npm run ${script}`;
    case "pnpm":
      return `pnpm run ${script}`;
    case "yarn":
      return `yarn ${script}`;
    case "bun":
      return `bun run ${script}`;
    case "deno":
      return script;
  }
}

async function readPackageJson(filePath: string): Promise<PackageJson | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}
