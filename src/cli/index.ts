#!/usr/bin/env node
import { Command } from "commander";
import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { getDatabasePath } from "../config/paths.js";
import { loadWorkflowFile } from "../workflow/loader.js";
import { validateWorkflow } from "../workflow/validator.js";
import type { WorkflowDefinitionV2 } from "../workflow/schema.js";
import { DatabaseContext } from "../persistence/db.js";
import { render } from "./output.js";
import { resolveLanguage } from "../config/language.js";
import { saveWireConfig } from "../config/wire.js";
import { loadCredentials, saveCredentials } from "../config/credentials.js";
import { WireClient } from "../wire/client.js";
import { discoverCanvas } from "../canvas/discovery.js";
import { listProvisioners, runProvisioning } from "../provisioning/service.js";
import { cancelRun, enqueueWork, pauseRun, persistWorkflow, rebindRunActor, resumeRun, startRun } from "../runner/lifecycle.js";
import type { Dispatch, LifecycleDeps } from "../runner/lifecycle.js";

export type CliDeps = { feed?: () => Promise<unknown>; workflow?: (file: string) => Promise<WorkflowDefinitionV2>; db?: DatabaseContext; write?: (text: string) => void; configPath?: string; dir?: string; client?: WireClient; dispatch?: Dispatch };
export function createCli(deps: CliDeps = {}) {
  const write = deps.write ?? (text => process.stdout.write(`${text}\n`));
  const lifecycle = (): LifecycleDeps => ({ db: deps.db, dir: deps.dir, client: deps.client, dispatch: deps.dispatch });
  const loadWire = async () => { if (deps.client) return deps.client; const credentials = await loadCredentials(); if (!credentials) throw new Error("Wire is not paired; run pair first"); return new WireClient(credentials); };
  const cli = new Command().name("maestri-flow").version("0.1.0").option("-l, --language <language>", "UI language (pt-BR or en)");
  cli.command("version").action(() => write("0.1.0"));
  cli.command("status").action(async () => { if (!deps.db) await mkdir(getDatabasePath().replace(/[\\/][^\\/]+$/, ""), { recursive: true }); const db = deps.db ?? new DatabaseContext(getDatabasePath()); const runs = db.db.prepare("SELECT id,status,workflow_id FROM runs ORDER BY created_at DESC").all(); write(render({ runs }, true)); });
  cli.command("validate").argument("[workflow]").action(async file => { if (!file) throw new Error("workflow file is required"); const w = await (deps.workflow ?? loadWorkflowFile)(file); const issues = validateWorkflow(w); write(render({ valid: !issues.some(i => i.severity === "error"), issues }, true)); if (issues.some(i => i.severity === "error")) process.exitCode = 1; });
  cli.command("inspect-canvas").action(async () => { if (!deps.feed) throw new Error("Wire feed dependency is required"); write(render(await deps.feed(), true)); });
  // Lazy on purpose: the ink/React TUI must only load when configure runs without flags.
  cli.command("configure").option("-l, --language <language>", "UI language (pt-BR or en)").option("--host <host>").option("--port <port>").option("--code <code>").option("--password <password>").option("--server-key-hash <hash>").option("--token <token>").action(async (options, command) => { const { runConfigureTui } = await import("../tui/app.js"); const language = resolveLanguage({ flag: command.opts().language ?? cli.opts().language }); if (options.host || options.port || options.code || options.password || options.serverKeyHash || options.token) { await saveWireConfig({ host: options.host, port: Number(options.port ?? 7434), ...(options.password ? { password: options.password } : { code: options.code }), serverKeyHash: options.serverKeyHash, ...(options.token ? { token: options.token } : {}) }, deps.configPath); write(language === "en" ? "Wire configuration saved; connection pending." : "Configuração do Wire salva; conexão pendente."); return; } await runConfigureTui({ language, configPath: deps.configPath }); });
  cli.command("pair").option("--host <host>").option("--port <port>").option("--code <code>").option("--password <password>").option("--server-key-hash <hash>").action(async options => {
    const credentials = await new WireClient(null, undefined, { host: options.host ?? "localhost", port: Number(options.port ?? 7434), serverKeyHash: options.serverKeyHash ?? "" }).pair({ host: options.host, port: options.port ? Number(options.port) : undefined, ...(options.password ? { password: options.password } : { code: options.code }), serverKeyHash: options.serverKeyHash });
    await saveCredentials(credentials);
    await saveWireConfig({ host: credentials.host, port: credentials.port, ...(options.password ? { password: options.password } : { code: options.code }), serverKeyHash: credentials.serverKeyHash }, deps.configPath);
    write("Pareamento concluído; credenciais salvas.");
  });
  cli.command("provision").option("--workspace <id>").option("--floor <floor>").option("--brief <text>").action(async options => {
    if (!options.workspace || !options.brief) throw new Error("provision requires --workspace and --brief");
    const client = await loadWire();
    const floor = options.floor ?? "ground";
    const getFeed = () => client.getFeed(options.workspace, floor);
    const discovery = discoverCanvas(await getFeed());
    const [provisioner] = listProvisioners(discovery);
    if (!provisioner) throw new Error("no live manager provisioner in the workspace");
    const result = await runProvisioning({ discovery, provisioner: { nodeId: provisioner.nodeId, snapshot: provisioner }, brief: options.brief, getFeed, sendPrompt: (terminalId, text) => client.sendPrompt(terminalId, text) });
    write(render({ status: result.status, staged: result.stagedProposal?.workItems ?? [] }, true));
  });
  cli.command("enqueue").argument("<workflow>").option("--title <title>").option("--body <body>").action(async (file, options) => {
    const workflow = await (deps.workflow ?? loadWorkflowFile)(file);
    const persisted = await persistWorkflow(workflow, lifecycle());
    const items = enqueueWork(persisted.id, [{ title: options.title ?? workflow.name, body: options.body ?? "" }], lifecycle());
    write(render({ workflow: persisted.id, path: persisted.path, items }, true));
  });
  cli.command("run").argument("<workflow>").option("--item <id>").action(async (file, options) => {
    const workflow = await (deps.workflow ?? loadWorkflowFile)(file);
    const persisted = await persistWorkflow(workflow, lifecycle());
    const status = await startRun(persisted.id, workflow, { workItemId: options.item }, lifecycle());
    write(render({ status: status ?? "drained" }, true));
  });
  cli.command("pause").argument("<runId>").action(async runId => { pauseRun(runId, lifecycle()); write(render({ runId, status: "paused" }, true)); });
  cli.command("resume").argument("<runId>").action(async runId => write(render({ runId, status: await resumeRun(runId, lifecycle()) }, true)));
  cli.command("cancel").argument("<runId>").action(async runId => { cancelRun(runId, lifecycle()); write(render({ runId, status: "cancelled" }, true)); });
  cli.command("rebind").argument("<runId>").argument("<key>").argument("<nodeId>").action(async (runId, key, nodeId) => { rebindRunActor(runId, key, nodeId, lifecycle()); write(render({ runId, key, nodeId }, true)); });
  return cli;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) createCli().parseAsync().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
