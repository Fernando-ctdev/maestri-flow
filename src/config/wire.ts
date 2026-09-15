import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PairInput } from "../wire/types.js";
import { getConfigPath } from "./paths.js";

export type WireConfig = Pick<PairInput, "host" | "port" | "code" | "password" | "serverKeyHash" | "serverCertificate" | "alternateHosts"> & { token?: string; deviceId?: string };

function valid(config: WireConfig): WireConfig {
  if (!config.host?.trim()) throw new Error("Wire host is required");
  const port = config.port;
  if (!Number.isInteger(port) || !port || port < 1 || port > 65535) throw new Error("Wire port must be between 1 and 65535");
  if (Boolean(config.code) === Boolean(config.password)) throw new Error("provide exactly one Wire code or password");
  return config;
}

export async function saveWireConfig(config: WireConfig, configPath = getConfigPath()): Promise<void> {
  const wire = valid(config);
  let existing: Record<string, unknown> = {};
  try { existing = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>; } catch { /* new config */ }
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ ...existing, wire }, null, 2)}\n`, "utf8");
}

export async function loadWireConfig(configPath = getConfigPath()): Promise<WireConfig | undefined> {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as { wire?: WireConfig };
    return parsed.wire;
  } catch { return undefined; }
}
