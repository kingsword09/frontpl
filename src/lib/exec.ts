import { spawn } from "node:child_process";
import process from "node:process";

export async function exec(
  command: string,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<{ ok: boolean }> {
  const resolved = resolveCommand(command);
  return new Promise((resolve) => {
    const child = spawn(resolved, args, {
      cwd: opts.cwd,
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    child.on("close", (code) => resolve({ ok: code === 0 }));
    child.on("error", () => resolve({ ok: false }));
  });
}

function resolveCommand(command: string) {
  if (process.platform !== "win32") return command;
  if (command === "npm") return "npm.cmd";
  if (command === "pnpm") return "pnpm.cmd";
  if (command === "yarn") return "yarn.cmd";
  return command;
}
