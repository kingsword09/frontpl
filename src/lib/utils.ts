import { access } from "node:fs/promises";

export async function pathExists(pathname: string) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}
