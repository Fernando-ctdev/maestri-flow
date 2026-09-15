#!/usr/bin/env node
import { Command } from "commander";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { getDatabasePath } from "../config/paths.js";
import { loadWorkflowFile } from "../workflow/loader.js";
import { validateWorkflow } from "../workflow/validator.js";
import { DatabaseContext } from "../persistence/db.js";
import { render } from "./output.js";

export type CliDeps = { feed?: () => Promise<unknown>; workflow?: (file: string) => Promise<any>; db?: DatabaseContext; write?: (text: string) => void };
export function createCli(deps: CliDeps = {}) {
  const write = deps.write ?? (text => process.stdout.write(`${text}\n`));
  const cli = new Command().name("maestri-flow").version("0.1.0");
  cli.command("version").action(() => write("0.1.0"));
  cli.command("status").action(async () => { if (!deps.db) await mkdir(getDatabasePath().replace(/[\\/][^\\/]+$/, ""), { recursive: true }); const db = deps.db ?? new DatabaseContext(getDatabasePath()); const runs = db.db.prepare("SELECT id,status,workflow_id FROM runs ORDER BY created_at DESC").all(); write(render({ runs }, true)); });
  cli.command("validate").argument("[workflow]").action(async file => { if (!file) throw new Error("workflow file is required"); const w = await (deps.workflow ?? loadWorkflowFile)(file); const issues = validateWorkflow(w); write(render({ valid: !issues.some(i => i.severity === "error"), issues }, true)); if (issues.some(i => i.severity === "error")) process.exitCode = 1; });
  cli.command("inspect-canvas").action(async () => { if (!deps.feed) throw new Error("Wire feed dependency is required"); write(render(await deps.feed(), true)); });
  cli.command("configure").action(async () => { const { runConfigureTui } = await import("../tui/app.js"); await runConfigureTui(); });
  for (const name of ["pair", "provision", "enqueue", "run", "pause", "resume", "cancel", "rebind"]) cli.command(name).action(() => { throw new Error(`${name} requires configured Wire/database dependencies`); });
  return cli;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) createCli().parseAsync().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
