import { cancel, intro, isCancel, outro, select, text } from "@clack/prompts";
import path from "node:path";
import process from "node:process";

import { readPackageJson, writePackageJson } from "../lib/project.ts";

type CommandOptions = {
  targetArg?: string;
  dryRun?: boolean;
};

type BumpMode = "patch" | "minor" | "major" | "custom";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export async function runBump({ targetArg, dryRun = false }: CommandOptions = {}) {
  intro("frontpl (bump)");

  const cwd = process.cwd();
  const packageJsonPath = path.join(cwd, "package.json");
  const pkg = await readPackageJson(packageJsonPath);
  if (!pkg) {
    cancel("Missing package.json. Run this command in a Node package directory.");
    process.exitCode = 1;
    return;
  }

  const currentVersion = pkg.version?.trim();
  const resolved = targetArg
    ? resolveVersionFromTargetArg({ currentVersion, targetArg })
    : await resolveVersionInteractively({ currentVersion });

  if (isCancel(resolved)) return onCancel();
  if (!resolved.ok) {
    cancel(resolved.reason);
    process.exitCode = 1;
    return;
  }

  if (!dryRun) {
    pkg.version = resolved.nextVersion;
    await writePackageJson(packageJsonPath, pkg);
  }

  outro(
    [
      dryRun
        ? "Dry run. Calculated package.json version update."
        : "Done. Updated package.json version.",
      `- from: ${currentVersion ?? "(missing)"}`,
      `- to: ${resolved.nextVersion}`,
      `- mode: ${resolved.mode}`,
    ].join("\n"),
  );
}

function resolveVersionFromTargetArg(opts: {
  currentVersion: string | undefined;
  targetArg: string;
}): { ok: true; mode: BumpMode | "set"; nextVersion: string } | { ok: false; reason: string } {
  const target = opts.targetArg.trim();
  if (!target) {
    return { ok: false, reason: "Target is required (patch | minor | major | <version>)" };
  }

  if (target === "patch" || target === "minor" || target === "major") {
    const nextVersion = bumpSemver(opts.currentVersion, target);
    if (!nextVersion) {
      return {
        ok: false,
        reason:
          "Current version is missing or invalid for bump mode. Set an explicit version (e.g. `frontpl bump 1.2.3`).",
      };
    }
    return { ok: true, mode: target, nextVersion };
  }

  if (!SEMVER_PATTERN.test(target)) {
    return {
      ok: false,
      reason: "Invalid version. Use semver like 1.2.3 (or prerelease/build variants).",
    };
  }

  return { ok: true, mode: "set", nextVersion: target };
}

async function resolveVersionInteractively(opts: {
  currentVersion: string | undefined;
}): Promise<
  { ok: true; mode: BumpMode | "set"; nextVersion: string } | { ok: false; reason: string } | symbol
> {
  const currentVersion = opts.currentVersion;
  const patchVersion = bumpSemver(currentVersion, "patch");
  const minorVersion = bumpSemver(currentVersion, "minor");
  const majorVersion = bumpSemver(currentVersion, "major");

  if (!patchVersion || !minorVersion || !majorVersion) {
    const customVersion = await text({
      message: "Current version is missing/invalid. Enter target version",
      initialValue: "0.1.0",
      validate: (value = "") =>
        SEMVER_PATTERN.test(value.trim())
          ? undefined
          : "Use semver like 1.2.3 (or prerelease/build variants)",
    });
    if (isCancel(customVersion)) return customVersion;
    return {
      ok: true,
      mode: "set",
      nextVersion: String(customVersion).trim(),
    };
  }

  const choice = await select<BumpMode>({
    message: `Select next version (current: ${currentVersion})`,
    initialValue: "patch",
    options: [
      { value: "patch", label: patchVersion, hint: "patch" },
      { value: "minor", label: minorVersion, hint: "minor" },
      { value: "major", label: majorVersion, hint: "major" },
      { value: "custom", label: "custom", hint: "set explicit version" },
    ],
  });
  if (isCancel(choice)) return choice;

  if (choice === "custom") {
    const customVersion = await text({
      message: "Target version",
      initialValue: currentVersion,
      validate: (value = "") =>
        SEMVER_PATTERN.test(value.trim())
          ? undefined
          : "Use semver like 1.2.3 (or prerelease/build variants)",
    });
    if (isCancel(customVersion)) return customVersion;
    return {
      ok: true,
      mode: "set",
      nextVersion: String(customVersion).trim(),
    };
  }

  return {
    ok: true,
    mode: choice,
    nextVersion:
      choice === "patch" ? patchVersion : choice === "minor" ? minorVersion : majorVersion,
  };
}

function bumpSemver(version: string | undefined, mode: "patch" | "minor" | "major") {
  const parsed = parseSemverCore(version);
  if (!parsed) return;

  const { major, minor, patch } = parsed;
  if (mode === "patch") return `${major}.${minor}.${patch + 1}`;
  if (mode === "minor") return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

function parseSemverCore(version: string | undefined) {
  if (!version) return;
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return;
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
  };
}

function onCancel() {
  cancel("Cancelled");
  process.exitCode = 0;
}
