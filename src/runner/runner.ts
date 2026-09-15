import type { WorkflowDefinitionV2 } from "../workflow/schema.js";
import { enterTerminal, reduceEngine } from "../engine/reducer.js";
import type { EngineState, ExecutionToken } from "../engine/types.js";
import type { QueueService } from "../queue/service.js";
import type { DatabaseContext } from "../persistence/db.js";
import { RunRepository, TokenRepository } from "../persistence/repositories.js";

type Dispatch = (token: ExecutionToken, node: any, workflow: WorkflowDefinitionV2) => Promise<{ outcome?: string; status?: string }>;
type Deps = { workflow?: WorkflowDefinitionV2; queue?: QueueService; dispatch?: Dispatch; state?: EngineState; db?: DatabaseContext; children?: (parentId: string) => Promise<string[]>; bindings?: Record<string, string> };

export class WorkflowRunner {
  private state: EngineState;
  constructor(private readonly deps: Deps = {}) { this.state = deps.state ?? { tokens: [] }; }
  currentState() { return this.state; }
  private save(token: ExecutionToken) { if (this.deps.db) new TokenRepository(this.deps.db).save(token); }
  private put(token: ExecutionToken) { this.state = { ...this.state, tokens: [...this.state.tokens.filter(t => t.id !== token.id), token] }; }
  private runStatus(runId: string, status: string) { if (this.deps.db) this.deps.db.db.prepare("UPDATE runs SET status=? WHERE id=?").run(status, runId); }
  private attempt(token: ExecutionToken, step: number) { if (this.deps.db) this.deps.db.db.prepare("INSERT OR IGNORE INTO attempts(id,token_id,status) VALUES(?,?,?)").run(`${token.id}:${step}`, token.id, "started"); }
  private result(token: ExecutionToken, outcome: string, step: number) { if (!this.deps.db) return; this.deps.db.transaction(db => { db.prepare("INSERT OR IGNORE INTO results(id,token_id,outcome,data) VALUES(?,?,?,?)").run(`${token.id}:${step}`, token.id, outcome, null); db.prepare("INSERT INTO events(run_id,type,data,created_at) VALUES(?,?,?,?)").run(token.runId, "TASK_RESULT", JSON.stringify({ tokenId: token.id, outcome }), Date.now()); }); }
  private fromRow(row: any): ExecutionToken { return { id: row.id, runId: row.run_id, workItemId: row.work_item_id, flowId: row.flow_id, nodeId: row.node_id, status: row.status, forkStack: JSON.parse(row.fork_stack) }; }
  async runQueue(workflowId: string) { if (!this.deps.queue) throw new Error("queue service required"); let item; while ((item = this.deps.queue.claimTopLevel())) { const status = await this.runWorkItem(workflowId, item.id); this.deps.queue.complete(item.id, status as any); if (status !== "completed") break; } }
  async runWorkItem(workflowId: string, workItemId: string): Promise<string> {
    const w = this.deps.workflow; if (!w) throw new Error("workflow required");
    const runId = `run-${workItemId}`;
    if (this.deps.db) this.deps.db.db.prepare("INSERT OR IGNORE INTO work_items(id,title,body,status,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(workItemId, workItemId, "", "running", "{}", Date.now(), Date.now());
    const persisted = this.deps.db ? new TokenRepository(this.deps.db).get(`token-${workItemId}`) : undefined;
    if (this.deps.db && persisted) this.state = { ...this.state, tokens: new TokenRepository(this.deps.db).byRun(persisted.run_id).map(row => this.fromRow(row)) };
    const active = this.state.tokens.find(t => t.workItemId === workItemId && !["completed", "cancelled"].includes(t.status));
    const token: ExecutionToken = active ?? (persisted ? { ...persisted, forkStack: JSON.parse(persisted.fork_stack) } : { id: `token-${workItemId}`, runId, workItemId, flowId: "main", nodeId: w.flows.main.entry, status: "ready", forkStack: [] });
    if (!active && !persisted) { if (this.deps.db) new RunRepository(this.deps.db).create(runId, workflowId, w.name, this.deps.bindings ?? Object.fromEntries(Object.entries(w.actors).map(([key, actor]) => [key, actor.nodeId]))); this.put(token); this.save(token); }
    return this.execute(token, w, workflowId);
  }
  private async execute(token: ExecutionToken, w: WorkflowDefinitionV2, workflowId: string, stop?: string): Promise<string> {
    for (let step = 0; step < 1000; step++) {
      const current = this.state.tokens.find(t => t.id === token.id) ?? token; if (current.nodeId === stop) return "ready"; const node: any = w.flows[current.flowId]?.nodes[current.nodeId]; if (!node) return "paused";
      this.save(current);
      if (node.type === "terminal") { this.state = enterTerminal(this.state, current.id, w); this.save({ ...current, status: node.status }); if (current.id === `token-${current.workItemId}`) this.runStatus(current.runId, node.status); return node.status; }
      if (node.type === "task") { if (!this.deps.dispatch) { this.runStatus(current.runId, "paused"); return "paused"; } this.attempt(current, step); const result = await this.deps.dispatch(current, node, w); if (result.status !== undefined && result.status !== "OK" || !result.outcome) { this.runStatus(current.runId, "paused"); return "paused"; } this.state = reduceEngine(this.state, { type: "TASK_RESULT", tokenId: current.id, outcome: result.outcome }, w); this.result(current, result.outcome, step); this.save(this.state.tokens.find(t => t.id === current.id)!); continue; }
      if (node.type === "parallel") { if (this.deps.db) this.deps.db.db.prepare("INSERT OR IGNORE INTO fork_instances(id,run_id,status,data) VALUES(?,?,?,?)").run(current.id, current.runId, "open", JSON.stringify({ branches: node.branches, join: node.join })); const results: string[] = []; for (const id of node.branches) results.push(await this.branch(current, id, node.join, w, workflowId)); if (results.some(x => x !== "ready" && x !== "completed")) return "paused"; if (this.deps.db) this.deps.db.db.prepare("UPDATE fork_instances SET status='joined' WHERE id=?").run(current.id); current.nodeId = node.join; this.save(current); continue; }
      if (node.type === "join") { current.nodeId = node.next; this.save(current); continue; }
      if (node.type === "foreach") { const children = await (this.deps.children?.(current.workItemId) ?? []); for (let offset = 0; offset < children.length; offset += node.concurrency) { const batch = children.slice(offset, offset + node.concurrency); const results = await Promise.all(batch.map(async child => { const id = `${current.id}:${child}`; const existing = this.state.tokens.find(t => t.id === id); const childToken: ExecutionToken = existing ?? { ...current, id, workItemId: child, flowId: node.flow, nodeId: w.flows[node.flow].entry, status: "ready", forkStack: [] }; if (!existing) { this.put(childToken); this.save(childToken); } return this.execute(childToken, w, workflowId); })); if (results.some(result => result !== "completed")) { if (node.onChildFailure) { current.nodeId = node.onChildFailure; this.save(current); } return "paused"; } } current.nodeId = node.onComplete; this.save(current); continue; }
      return "paused";
    }
    return "paused";
  }
  private async branch(parent: ExecutionToken, nodeId: string, join: string, w: WorkflowDefinitionV2, workflowId: string) { const id = `${parent.id}:branch:${nodeId}`; const existing = this.state.tokens.find(t => t.id === id); const branch: ExecutionToken = existing ?? { ...parent, id, nodeId, status: "ready", forkStack: [...parent.forkStack, { forkId: parent.id, joinNodeId: join, branchId: nodeId }] }; if (!existing) { this.put(branch); this.save(branch); } return this.execute(branch, w, workflowId, join); }
  async resume(runId: string) { let token = this.state.tokens.find(t => t.runId === runId); if (this.deps.db) { const rows = new TokenRepository(this.deps.db).byRun(runId); if (rows.length) { this.state = { ...this.state, tokens: rows.map(row => this.fromRow(row)) }; token = this.state.tokens.find(t => t.id === `token-${t.workItemId}`) ?? this.state.tokens[0]; } } if (!token) throw new Error("run not found"); return this.execute(token, this.deps.workflow!, "__resume__"); }
  advance(event: any, workflow: WorkflowDefinitionV2) { this.state = reduceEngine(this.state, event, workflow); return this.state; }
  terminal(tokenId: string, workflow: WorkflowDefinitionV2) { this.state = enterTerminal(this.state, tokenId, workflow); return this.state; }
}
