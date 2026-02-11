import { cancel, confirm, intro, isCancel, outro, select, spinner, text } from "@clack/prompts";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { exec } from "../lib/exec.js";
import { writeText } from "../lib/fs.js";
import { detectPackageManagerVersion } from "../lib/versions.js";
import {
  editorconfigTemplate,
  gitattributesTemplate,
  githubCliCiWorkflowTemplate,
  githubCliReleaseBothWorkflowTemplate,
  githubCliReleaseWorkflowTemplate,
  githubCliReleaseTagWorkflowTemplate,
  githubDependabotTemplate,
  gitignoreTemplate,
  oxfmtConfigTemplate,
  oxlintConfigTemplate,
  packageJsonTemplate,
  readmeTemplate,
  srcIndexTemplate,
  srcVitestTemplate,
  tsconfigTemplate,
  tsdownConfigTemplate,
} from "../lib/templates.js";
import { pathExists } from "../lib/utils.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
type GithubActionsPreset = "none" | "ci" | "ci+release";
type GithubReleaseMode = "tag" | "commit" | "both";

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

export async function runInit({ nameArg }: { nameArg?: string }) {
  intro("frontpl");

  const projectName = await text({
    message: "Project name",
    initialValue: nameArg ?? "my-frontend",
    validate: validateProjectName,
  });
  if (isCancel(projectName)) return onCancel();

  const packageManager = await select<PackageManager>({
    message: "Package manager",
    initialValue: "pnpm",
    options: [
      { value: "npm", label: "npm" },
      { value: "yarn", label: "yarn" },
      { value: "pnpm", label: "pnpm" },
      { value: "bun", label: "bun" },
      { value: "deno", label: "deno" },
    ],
  });
  if (isCancel(packageManager)) return onCancel();

  const pnpmWorkspace =
    packageManager === "pnpm"
      ? await confirm({
          message: "pnpm workspace mode (monorepo skeleton)?",
          initialValue: false,
        })
      : false;
  if (isCancel(pnpmWorkspace)) return onCancel();

  const useOxlint = await confirm({
    message: "Enable oxlint (@kingsword/lint-config preset)?",
    initialValue: true,
  });
  if (isCancel(useOxlint)) return onCancel();

  const useOxfmt = await confirm({
    message: "Enable oxfmt (code formatting)?",
    initialValue: true,
  });
  if (isCancel(useOxfmt)) return onCancel();

  const useVitest = await confirm({
    message: "Add Vitest?",
    initialValue: false,
  });
  if (isCancel(useVitest)) return onCancel();

  const useTsdown = await confirm({
    message: "Add tsdown build?",
    initialValue: true,
  });
  if (isCancel(useTsdown)) return onCancel();

  const initGit = await confirm({
    message: "Initialize a git repository?",
    initialValue: true,
  });
  if (isCancel(initGit)) return onCancel();

  const githubActions = await select<GithubActionsPreset>({
    message: "GitHub Actions workflows",
    initialValue: "ci",
    options: [
      { value: "none", label: "None" },
      { value: "ci", label: "CI only" },
      { value: "ci+release", label: "CI + release" },
    ],
  });
  if (isCancel(githubActions)) return onCancel();

  const releaseMode =
    githubActions === "ci+release"
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
  if (isCancel(releaseMode)) return onCancel();

  const addDependabot =
    initGit && githubActions !== "none"
      ? await confirm({
          message: "Add Dependabot config (.github/dependabot.yml)?",
          initialValue: true,
        })
      : false;
  if (isCancel(addDependabot)) return onCancel();

  const trustedPublishing =
    githubActions === "ci+release" && packageManager !== "deno"
      ? await confirm({
          message: "Release: npm trusted publishing (OIDC)?",
          initialValue: true,
        })
      : undefined;
  if (isCancel(trustedPublishing)) return onCancel();

  const rootDir = path.resolve(process.cwd(), projectName);
  if (await pathExists(rootDir)) {
    cancel(`Directory already exists: ${rootDir}`);
    process.exitCode = 1;
    return;
  }

  const pkgDir = pnpmWorkspace ? path.join(rootDir, "packages", projectName) : rootDir;

  const pmVersion = await detectPackageManagerVersion(packageManager);
  const packageManagerField = pmVersion
    ? `${packageManager}@${pmVersion}`
    : `${packageManager}@latest`;

  await mkdir(path.join(pkgDir, "src"), { recursive: true });

  await Promise.all([
    writeText(path.join(rootDir, ".editorconfig"), editorconfigTemplate()),
    writeText(path.join(rootDir, ".gitignore"), gitignoreTemplate()),
    writeText(path.join(rootDir, ".gitattributes"), gitattributesTemplate()),
  ]);

  if (pnpmWorkspace) {
    await writeText(
      path.join(rootDir, "pnpm-workspace.yaml"),
      ["packages:", '  - "packages/*"', ""].join("\n"),
    );
    await writeText(
      path.join(rootDir, "package.json"),
      JSON.stringify(
        {
          name: projectName,
          private: true,
          packageManager: packageManagerField,
        },
        null,
        2,
      ) + "\n",
    );
  }

  await Promise.all([
    writeText(path.join(pkgDir, "README.md"), readmeTemplate(projectName)),
    writeText(path.join(pkgDir, "src/index.ts"), srcIndexTemplate()),
    writeText(path.join(pkgDir, "tsconfig.json"), tsconfigTemplate()),
    writeText(
      path.join(pkgDir, "package.json"),
      packageJsonTemplate({
        name: projectName,
        packageManager: packageManagerField,
        typescriptVersion: "latest",
        useOxlint,
        oxlintVersion: "latest",
        oxlintTsgolintVersion: "latest",
        kingswordLintConfigVersion: "latest",
        useOxfmt,
        oxfmtVersion: "latest",
        useVitest,
        vitestVersion: "latest",
        useTsdown,
        tsdownVersion: "latest",
      }),
    ),
  ]);

  if (useOxlint) {
    await writeText(path.join(pkgDir, "oxlint.config.ts"), oxlintConfigTemplate({ useVitest }));
  }
  if (useOxfmt) {
    await writeText(path.join(pkgDir, ".oxfmtrc.json"), oxfmtConfigTemplate());
  }
  if (useVitest) {
    await writeText(path.join(pkgDir, "src/index.test.ts"), srcVitestTemplate());
  }
  if (useTsdown) {
    await writeText(path.join(pkgDir, "tsdown.config.ts"), tsdownConfigTemplate());
  }
  if (packageManager === "deno") {
    await writeText(
      path.join(rootDir, "deno.json"),
      JSON.stringify({ nodeModulesDir: "auto" }, null, 2) + "\n",
    );
  }

  if (githubActions !== "none") {
    const workingDirectory = pnpmWorkspace ? path.posix.join("packages", projectName) : ".";
    const lintCommand =
      useOxlint && packageManager !== "deno" ? pmRun(packageManager, "lint") : undefined;
    const formatCheckCommand =
      useOxfmt && packageManager !== "deno" ? pmRun(packageManager, "format:check") : undefined;
    const testCommand =
      useVitest && packageManager !== "deno" ? pmRun(packageManager, "test") : undefined;

    await writeText(
      path.join(rootDir, ".github/workflows/ci.yml"),
      githubCliCiWorkflowTemplate({
        packageManager,
        nodeVersion: 22,
        workingDirectory,
        runLint: useOxlint,
        runFormatCheck: useOxfmt,
        runTests: useVitest,
        lintCommand,
        formatCheckCommand,
        testCommand,
      }),
    );

    if (addDependabot) {
      await writeText(
        path.join(rootDir, ".github/dependabot.yml"),
        githubDependabotTemplate({
          packageManager,
          workingDirectory,
        }),
      );
    }
  }

  if (githubActions === "ci+release") {
    const workingDirectory = pnpmWorkspace ? path.posix.join("packages", projectName) : ".";

    await writeText(
      path.join(rootDir, ".github/workflows/release.yml"),
      (releaseMode === "both"
        ? githubCliReleaseBothWorkflowTemplate
        : releaseMode === "commit"
          ? githubCliReleaseWorkflowTemplate
          : githubCliReleaseTagWorkflowTemplate)({
        packageManager,
        nodeVersion: 22,
        workingDirectory,
        trustedPublishing,
      }),
    );
  }

  const canInstall = Boolean(pmVersion);
  let installOk = false;
  if (canInstall) {
    const installSpinner = spinner();
    installSpinner.start(`Installing dependencies with ${packageManager}`);
    const installResult = await exec(packageManager, ["install"], { cwd: rootDir });
    installOk = installResult.ok;
    installSpinner.stop(installOk ? "Dependencies installed" : "Install failed (skipped)");
  }

  if (initGit) {
    await exec("git", ["init"], { cwd: rootDir });
  }

  const installHint = !canInstall
    ? `\n  (${packageManager} not found, run install manually)`
    : !installOk
      ? `\n  (${packageManager} install failed, run install manually)`
      : "";
  outro(`Done. Next:\n  cd ${projectName}${installHint}\n  ${nextStepHint(packageManager)}`);
}

function validateProjectName(value: string | undefined) {
  const name = (value ?? "").trim();
  if (!name) return "Project name is required";
  if (name.length > 214) return "Project name is too long";
  if (name.startsWith(".")) return "Project name cannot start with '.'";
  if (name.startsWith("_")) return "Project name cannot start with '_'";
  if (/[A-Z]/.test(name)) return "Use lowercase letters only";
  if (!/^[a-z0-9._-]+$/.test(name)) return "Use letters, numbers, '.', '_' or '-'";
  return;
}

function onCancel() {
  cancel("Cancelled");
  process.exitCode = 0;
}

function nextStepHint(pm: PackageManager) {
  switch (pm) {
    case "npm":
      return "npm run lint";
    case "pnpm":
      return "pnpm run lint";
    case "yarn":
      return "yarn lint";
    case "bun":
      return "bun run lint";
    case "deno":
      return "deno task lint  # (or run the package.json scripts with your preferred runner)";
  }
}
