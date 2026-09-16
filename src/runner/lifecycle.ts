import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import type { WorkflowDefinitionV2 } from "../workflow/schema.js";
import { parseWorkflowYaml, saveWorkflowFile } from "../workflow/loader.js";
import { validateWorkflow } from "../workflow/validator.js";
import { DatabaseContext } from "../persistence/db.js";
import { getDatabasePath, getWorkflowDir } from "../config/paths.js";
import { EventRepository, RunRepository, TokenRepository, WorkflowRepository } from "../persistence/repositories.js";
import { QueueService } from "../queue/service.js";
import { WorkflowRunner } from "./runner.js";
import { executeTask } from "./dispatch.js";
import { discoverCanvas } from "../canvas/discovery.js";
import type { ExecutionToken } from "../engine/types.js";
import { loadCredentials } from "../config/credentials.js";
import { WireClient } from "../wire/client.js";

type DispatchNode = { actor: string; prompt?: string; outcomes: Record<string, string> };
export type Dispatch = (token: ExecutionToken, node: DispatchNode, workflow: WorkflowDefinitionV2) => Promise<{ outcome?: string; status?: string }>;
export type LifecycleDeps = { db?: DatabaseContext; dir?: string; workflow?: WorkflowDefinitionV2; client?: WireClient; dispatch?: Dispatch; children?: (parentId: string) => Promise<string[]> };
export type RunRow = { id: string; workflow_id: string; status: string; revision: string; created_at: number };
export type EventRow = { id: number; run_id: string; type: string; data: string; created_at: number };
type TokenRow = { id: string; run_id: string; work_item_id: string; flow_id: string; node_id: string; status: string; fork_stack: string };

let sharedDb: DatabaseContext | undefined;
const resolveDb = (deps: LifecycleDeps) => deps.db ?? (sharedDb ??= new DatabaseContext(getDatabasePath()));
const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workflow";
// better-sqlite3 returns raw column rows; repository layer is untyped by design.
const tokenFromRow = (row: unknown) => { const r = row as TokenRow; return { id: r.id, runId: r.run_id, workItemId: r.work_item_id, flowId: r.flow_id, nodeId: r.node_id, status: r.status, forkStack: JSON.parse(r.fork_stack) as unknown[] }; };
const loadStoredWorkflow = (row: unknown): WorkflowDefinitionV2 => { const source = (row as { source?: string } | undefined)?.source; if (!source) throw new Error("workflow not found"); return parseWorkflowYaml(source); };
const defaultClient = async () => { const credentials = await loadCredentials(); return credentials ? new WireClient(credentials) : undefined; };
const runActorBindings = (db: DatabaseContext) => (runId: string) => Object.fromEntries((db.db.prepare("SELECT key,node_id FROM run_actor_bindings WHERE run_id=?").all(runId) as { key: string; node_id: string }[]).map(row => [row.key, row.node_id]));

const wireDispatch = (workflow: WorkflowDefinitionV2, client: WireClient, loadBindings?: (runId: string) => Record<string, string>): Dispatch => async (token, node) => {
  const overrides = loadBindings?.(token.runId) ?? {};
  const feed = async () => discoverCanvas(await client.getFeed(workflow.workspace.id, workflow.workspace.floor));
  let terminalId = "";
  const result = await executeTask({
    actor: node.actor,
    prompt: node.prompt,
    outcomes: Object.keys(node.outcomes),
    discovery: await feed(),
    actors: Object.fromEntries(Object.entries(workflow.actors).map(([key, actor]) => [key, { key, label: actor.label, nodeId: overrides[key] ?? actor.nodeId }])),
    send: async (id, text) => { terminalId = id; await client.sendPrompt(id, text); },
    capture: async () => (await feed()).terminals.find(terminal => terminal.id === terminalId)?.preview.join("\n") ?? "",
  });
  return { status: result.status, outcome: result.status === "OK" ? result.result.outcome : undefined };
};

const resolveDispatch = async (workflow: WorkflowDefinitionV2, deps: LifecycleDeps, loadBindings?: (runId: string) => Record<string, string>): Promise<Dispatch | undefined> => {
  if (deps.dispatch) return deps.dispatch;
  const client = deps.client ?? await defaultClient();
  return client ? wireDispatch(workflow, client, loadBindings) : undefined;
};

export async function persistWorkflow(workflow: WorkflowDefinitionV2, deps: LifecycleDeps = {}) {
  const issues = validateWorkflow(workflow).filter(issue => issue.severity === "error");
  if (issues.length) throw new Error(`invalid workflow: ${issues.map(issue => `${issue.code}${issue.path ? ` at ${issue.path}` : ""}`).join("; ")}`);
  const id = slugify(workflow.name);
  const dir = deps.dir ?? getWorkflowDir();
  const source = stringify(workflow);
  const path = join(dir, `${id}.yaml`);
  await mkdir(dir, { recursive: true });
  await saveWorkflowFile(path, workflow);
  const hash = createHash("sha256").update(source).digest("hex");
  new WorkflowRepository(resolveDb(deps)).save(id, source, hash);
  return { id, path, hash };
}

export interface WorkItemDraft { key?: string; title: string; body?: string }
export function enqueueWork(workflowId: string, items: WorkItemDraft[], deps: LifecycleDeps = {}): string[] {
  return new QueueService(resolveDb(deps)).createMany(items.map(item => ({ id: item.key ?? `wi-${randomUUID()}`, title: item.title, body: item.body ?? "", metadata: { workflowId } })));
}

export async function startRun(workflowId: string, workflow: WorkflowDefinitionV2, options: { workItemId?: string } = {}, deps: LifecycleDeps = {}) {
  const db = resolveDb(deps);
  const runner = new WorkflowRunner({ workflow, db, queue: new QueueService(db), dispatch: await resolveDispatch(workflow, deps, runActorBindings(db)), children: deps.children });
  return options.workItemId ? runner.runWorkItem(workflowId, options.workItemId) : runner.runQueue(workflowId);
}

export function pauseRun(runId: string, deps: LifecycleDeps = {}) {
  const db = resolveDb(deps);
  if (!new RunRepository(db).get(runId)) throw new Error("run not found");
  new RunRepository(db).status(runId, "paused");
  new EventRepository(db).append(runId, "RUN_PAUSED", { reason: "manual" });
}

export async function resumeRun(runId: string, deps: LifecycleDeps = {}) {
  const db = resolveDb(deps);
  const run = new RunRepository(db).get(runId);
  if (!run) throw new Error("run not found");
  if (run.status === "cancelled") throw new Error("run cancelled");
  const workflow = deps.workflow ?? loadStoredWorkflow(new WorkflowRepository(db).get(run.workflow_id));
  new RunRepository(db).status(runId, "running");
  new EventRepository(db).append(runId, "RUN_RESUMED", {});
  const runner = new WorkflowRunner({ workflow, db, dispatch: await resolveDispatch(workflow, deps, runActorBindings(db)), children: deps.children });
  return runner.resume(runId);
}

export function cancelRun(runId: string, deps: LifecycleDeps = {}) {
  const db = resolveDb(deps);
  if (!new RunRepository(db).get(runId)) throw new Error("run not found");
  new RunRepository(db).status(runId, "cancelled");
  const tokens = new TokenRepository(db);
  for (const row of tokens.byRun(runId)) { const token = tokenFromRow(row); if (!["completed", "cancelled"].includes(token.status)) tokens.save({ ...token, status: "cancelled" }); }
  new EventRepository(db).append(runId, "RUN_CANCELLED", { reason: "manual" });
}

export function rebindRunActor(runId: string, key: string, nodeId: string, deps: LifecycleDeps = {}) {
  const db = resolveDb(deps);
  if (!new RunRepository(db).get(runId)) throw new Error("run not found");
  db.db.prepare("INSERT INTO run_actor_bindings(run_id,key,node_id) VALUES(?,?,?) ON CONFLICT(run_id,key) DO UPDATE SET node_id=excluded.node_id").run(runId, key, nodeId);
  new EventRepository(db).append(runId, "RUN_REBIND", { key, nodeId });
}

export function listRuns(deps: LifecycleDeps = {}): RunRow[] {
  return resolveDb(deps).db.prepare("SELECT * FROM runs ORDER BY created_at DESC, id").all() as RunRow[];
}

export function runEvents(runId: string, deps: LifecycleDeps = {}): EventRow[] {
  return resolveDb(deps).db.prepare("SELECT * FROM events WHERE run_id=? ORDER BY created_at, id").all(runId) as EventRow[];
}
