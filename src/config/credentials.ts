import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chmodSync } from "node:fs";
import path from "node:path";
import type { Credentials } from "../wire/types.js";
import { getConfigDir } from "./paths.js";

export async function saveCredentials(credentials: Credentials, env?: Record<string,string|undefined>): Promise<void> {
  const dir = getConfigDir(env); await mkdir(dir, { recursive:true });
  const file = path.join(dir, "credentials.json"); await writeFile(file, JSON.stringify(credentials), { mode:0o600 });
  try { chmodSync(file, 0o600); } catch { /* restrictive permissions are platform-dependent */ }
}
export async function loadCredentials(env?: Record<string,string|undefined>): Promise<Credentials|null> {
  try { return JSON.parse(await readFile(path.join(getConfigDir(env), "credentials.json"), "utf8")) as Credentials; } catch { return null; }
}
