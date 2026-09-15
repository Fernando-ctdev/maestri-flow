import os from "node:os";
import path from "node:path";

type Environment = Record<string, string | undefined>;

export function getConfigDir(env: Environment = process.env): string {
  return env.MAESTRI_FLOW_HOME || path.join(env.APPDATA || env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "maestri-flow");
}

const join = (base: string, child: string) => base.startsWith("/") ? path.posix.join(base, child) : path.join(base, child);
export const getDataDir = getConfigDir;
export const getConfigPath = (env?: Environment) => join(getConfigDir(env), "config.json");
export const getWorkflowDir = (env?: Environment) => join(getConfigDir(env), "workflows");
export const getDatabasePath = (env?: Environment) => join(getConfigDir(env), "state.db");
