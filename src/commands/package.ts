import { cancel, confirm, intro, isCancel, outro, select } from "@clack/prompts";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import {
  detectPackageManager,
  readPackageJson,
  writePackageJson,
  type PackageJson,
} from "../lib/project.ts";

type CommandOptions = {
  yes?: boolean;
};

type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";
type SupportedLicense = "MIT" | "Apache-2.0";

type GithubRepository = {
  owner: string;
  repo: string;
};

export async function runPackage({ yes = false }: CommandOptions = {}) {
  intro("frontpl (pkg)");

  const cwd = process.cwd();
  const packageJsonPath = path.join(cwd, "package.json");
  const pkg = await readPackageJson(packageJsonPath);
  if (!pkg) {
    cancel("Missing package.json. Run this command in a Node package directory.");
    process.exitCode = 1;
    return;
  }

  const gitRoot = runGitCapture(cwd, ["rev-parse", "--show-toplevel"]);
  if (!gitRoot) {
    cancel("Current directory is not inside a git repository.");
    process.exitCode = 1;
    return;
  }

  const originUrl = runGitCapture(cwd, ["config", "--get", "remote.origin.url"]);
  if (!originUrl) {
    cancel("Missing git remote `origin`. Set a GitHub remote before normalizing package.json.");
    process.exitCode = 1;
    return;
  }

  const repository = parseGithubRepository(originUrl);
  if (!repository) {
    cancel("Only github.com remotes are supported by `frontpl pkg`.");
    process.exitCode = 1;
    return;
  }

  const shouldApply =
    yes ||
    (await confirm({
      message: "Normalize package.json for npm publish defaults?",
      initialValue: true,
    }));
  if (isCancel(shouldApply)) return onCancel();
  if (!shouldApply) {
    cancel("Skipped package.json normalization");
    process.exitCode = 0;
    return;
  }

  const packageManager = await resolvePackageManager(pkg.packageManager, gitRoot, cwd);
  const selectedLicense = await resolveLicenseSelection(pkg, yes);
  if (isCancel(selectedLicense)) return onCancel();
  const repositoryDirectory = resolveRepositoryDirectory(gitRoot, cwd);
  normalizePackageJson(pkg, {
    repository,
    repositoryDirectory,
    packageManager,
    selectedLicense: selectedLicense ?? undefined,
  });

  await writePackageJson(packageJsonPath, pkg);

  outro(
    [
      "Done. Normalized package.json for publishing.",
      `- repository: ${repository.owner}/${repository.repo}`,
      `- packageManager: ${packageManager}`,
      `- repositoryDirectory: ${repositoryDirectory ?? "(root)"}`,
    ].join("\n"),
  );
}

function normalizePackageJson(
  pkg: PackageJson,
  opts: {
    repository: GithubRepository;
    repositoryDirectory?: string;
    packageManager: PackageManager;
    selectedLicense?: SupportedLicense;
  },
) {
  const { repository, repositoryDirectory, packageManager, selectedLicense } = opts;

  pkg.private = false;
  if (!pkg.version) pkg.version = "0.0.0";
  pkg.license = selectedLicense ?? pkg.license ?? "MIT";
  if (!pkg.type) pkg.type = "module";
  if (!pkg.files || pkg.files.length === 0) pkg.files = ["dist"];
  if (!pkg.main) pkg.main = "./dist/index.mjs";
  if (!pkg.types) pkg.types = "./dist/index.d.mts";
  if (!pkg.exports) {
    pkg.exports = {
      ".": {
        types: pkg.types,
        import: pkg.main,
        require: pkg.main,
      },
    };
  }

  const repoUrl = `git+https://github.com/${repository.owner}/${repository.repo}.git`;
  pkg.homepage = `https://github.com/${repository.owner}/${repository.repo}#readme`;
  pkg.bugs = {
    url: `https://github.com/${repository.owner}/${repository.repo}/issues`,
  };
  pkg.repository = {
    type: "git",
    url: repoUrl,
    ...(repositoryDirectory ? { directory: repositoryDirectory } : {}),
  };

  const publishConfig =
    pkg.publishConfig && typeof pkg.publishConfig === "object" ? { ...pkg.publishConfig } : {};
  if (!publishConfig.access) publishConfig.access = "public";
  pkg.publishConfig = publishConfig;

  const engines = pkg.engines ? { ...pkg.engines } : {};
  if (!engines.node) engines.node = ">=22.0.0";
  pkg.engines = engines;

  if (pkg.scripts && typeof pkg.scripts.build === "string" && !pkg.scripts.prepublishOnly) {
    pkg.scripts = {
      ...pkg.scripts,
      prepublishOnly: pmRun(packageManager, "build"),
    };
  }
}

async function resolveLicenseSelection(pkg: PackageJson, yes: boolean) {
  if (yes) return pkg.license ? undefined : "MIT";

  const currentLicense = pkg.license?.trim();
  const selectedLicense = await select<SupportedLicense>({
    message: currentLicense
      ? `Select license for publish metadata (current: ${currentLicense})`
      : "package.json missing `license`. Select one",
    initialValue: currentLicense === "Apache-2.0" ? "Apache-2.0" : "MIT",
    options: [
      {
        value: "MIT",
        label: "MIT",
        hint: "GitHub API key: mit",
      },
      {
        value: "Apache-2.0",
        label: "Apache-2.0",
        hint: "GitHub API key: apache-2.0",
      },
    ],
  });
  if (isCancel(selectedLicense)) return selectedLicense;
  return selectedLicense;
}

async function resolvePackageManager(
  packageManagerField: string | undefined,
  gitRoot: string,
  cwd: string,
): Promise<PackageManager> {
  const fromField = packageManagerField?.split("@")[0];
  if (isPackageManager(fromField)) return fromField;

  const fromGitRoot = await detectPackageManager(gitRoot);
  if (fromGitRoot) return fromGitRoot;

  const fromCwd = await detectPackageManager(cwd);
  if (fromCwd) return fromCwd;

  return "pnpm";
}

function isPackageManager(value: string | undefined): value is PackageManager {
  return (
    value === "npm" || value === "pnpm" || value === "yarn" || value === "bun" || value === "deno"
  );
}

function resolveRepositoryDirectory(gitRoot: string, cwd: string): string | undefined {
  const relativePath = path.relative(gitRoot, cwd);
  if (!relativePath || relativePath === ".") return;
  if (relativePath.startsWith("..")) return;
  return relativePath.split(path.sep).join("/");
}

function parseGithubRepository(remoteUrl: string): GithubRepository | undefined {
  const trimmed = remoteUrl.trim();

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! };

  const sshProtocolMatch = trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshProtocolMatch) return { owner: sshProtocolMatch[1]!, repo: sshProtocolMatch[2]! };

  const gitProtocolMatch = trimmed.match(/^git:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (gitProtocolMatch) return { owner: gitProtocolMatch[1]!, repo: gitProtocolMatch[2]! };

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return;
    const [owner, repo] = url.pathname.replace(/^\/|\/$/g, "").split("/");
    if (!owner || !repo) return;
    return {
      owner,
      repo: repo.replace(/\.git$/, ""),
    };
  } catch {
    return;
  }
}

function runGitCapture(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return;
  return result.stdout.trim() || undefined;
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

function onCancel() {
  cancel("Cancelled");
  process.exitCode = 0;
}
