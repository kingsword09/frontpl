import { readFile } from "node:fs/promises";
import path from "node:path";

import { writeText } from "./fs.js";
import { pathExists } from "./utils.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "deno";

export type PackageJson = {
  name?: string;
  packageManager?: string;
  prettier?: unknown;
  eslintConfig?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { node?: string };
};

export async function readPackageJson(filePath: string): Promise<PackageJson | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

export async function writePackageJson(filePath: string, value: PackageJson) {
  await writeText(filePath, JSON.stringify(value, null, 2) + "\n");
}

export async function detectPackageManager(rootDir: string): Promise<PackageManager | undefined> {
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
  if (await pathExists(path.join(rootDir, "bun.lock"))) candidates.push("bun");
  if (
    (await pathExists(path.join(rootDir, "deno.json"))) ||
    (await pathExists(path.join(rootDir, "deno.jsonc")))
  )
    candidates.push("deno");

  return candidates.length === 1 ? candidates[0] : undefined;
}

function isPackageManager(value: string): value is PackageManager {
  return (
    value === "npm" || value === "pnpm" || value === "yarn" || value === "bun" || value === "deno"
  );
}
