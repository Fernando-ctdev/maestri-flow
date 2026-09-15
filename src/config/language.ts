import { readFileSync } from "node:fs";
import { getConfigPath } from "./paths.js";

export type Language = "pt-BR" | "en";

function normalize(value: unknown): Language | undefined {
  if (typeof value !== "string") return undefined;
  const language = value.trim().toLowerCase();
  if (language === "en" || language === "en-us") return "en";
  if (language === "pt" || language === "pt-br") return "pt-BR";
  return undefined;
}

export function resolveLanguage(options: { flag?: string; env?: Record<string, string | undefined>; configPath?: string } = {}): Language {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? getConfigPath(env);
  let configured: unknown;
  try {
    configured = JSON.parse(readFileSync(configPath, "utf8")).language;
  } catch {
    configured = undefined;
  }
  return normalize(options.flag) ?? normalize(env.MAESTRI_FLOW_LANGUAGE) ?? normalize(configured) ?? "pt-BR";
}
