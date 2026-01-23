import { spawn } from "node:child_process";
import os from "node:os";
import process from "node:process";

export async function detectPackageManagerVersion(pm: "npm" | "pnpm" | "yarn" | "bun" | "deno") {
  switch (pm) {
    case "npm":
      return (await execCapture("npm", ["--version"])).stdout.trim() || undefined;
    case "pnpm":
      return (await execCapture("pnpm", ["--version"])).stdout.trim() || undefined;
    case "yarn":
      return (await execCapture("yarn", ["--version"])).stdout.trim() || undefined;
    case "bun":
      return (await execCapture("bun", ["--version"])).stdout.trim() || undefined;
    case "deno": {
      const out = (await execCapture("deno", ["--version"])).stdout.trim();
      const firstLine = out.split("\n")[0] ?? "";
      const match = firstLine.match(/deno\\s+([0-9]+\\.[0-9]+\\.[0-9]+)/);
      return match?.[1];
    }
  }
}

async function execCapture(command: string, args: string[]) {
  const resolved = resolveCommand(command);
  return new Promise<{ ok: boolean; stdout: string }>((resolve) => {
    const child = spawn(resolved, args, {
      cwd: os.tmpdir(),
      stdio: ["ignore", "pipe", "ignore"],
      shell: false,
      env: process.env,
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout: Buffer.concat(chunks).toString("utf8") });
    });
    child.on("error", () => resolve({ ok: false, stdout: "" }));
  });
}

function resolveCommand(command: string) {
  if (process.platform !== "win32") return command;
  if (command === "npm") return "npm.cmd";
  if (command === "pnpm") return "pnpm.cmd";
  if (command === "yarn") return "yarn.cmd";
  return command;
}
