import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseContext } from "../../src/persistence/db.js";
import { RunRepository, TokenRepository, WorkflowRepository } from "../../src/persistence/repositories.js";
import { QueueService } from "../../src/queue/service.js";
import { WorkflowRunner } from "../../src/runner/runner.js";
import type { WireClient } from "../../src/wire/client.js";
import type { FeedSnapshot } from "../../src/wire/types.js";
import type { WorkflowDefinitionV2 } from "../../src/workflow/schema.js";
import { cancelRun, enqueueWork, listRuns, pauseRun, persistWorkflow, rebindRunActor, resumeRun, runEvents, startRun } from "../../src/runner/lifecycle.js";

const workflow = () => ({ version: 2, name: "Demo Flow", workspace: { id: "w", floor: "ground" }, topology: { mode: "off" }, actors: { a: { label: "A", nodeId: "n" } }, flows: { main: { entry: "first", nodes: { first: { type: "task", actor: "a", outcomes: { ok: "done" } }, done: { type: "terminal", status: "completed" } } } } }) satisfies WorkflowDefinitionV2;
const twoTask = () => ({ version: 2, name: "Two", workspace: { id: "w", floor: "ground" }, topology: { mode: "off" }, actors: { a: { label: "A", nodeId: "n" } }, flows: { main: { entry: "first", nodes: { first: { type: "task", actor: "a", outcomes: { ok: "second" } }, second: { type: "task", actor: "a", outcomes: { ok: "done" } }, done: { type: "terminal", status: "completed" } } } } }) satisfies WorkflowDefinitionV2;
const ok = () => ({ status: "OK", outcome: "ok" });

describe("workflow lifecycle", () => {
  it("persists the workflow file and repository row with a sha256 hash", async () => {
    const db = new DatabaseContext();
    const dir = mkdtempSync(join(tmpdir(), "maestri-lifecycle-"));
    try {
      const saved = await persistWorkflow(workflow(), { db, dir });
      expect(saved.id).toBe("demo-flow");
      expect(readFileSync(saved.path, "utf8")).toContain("Demo Flow");
      const row = new WorkflowRepository(db).get("demo-flow") as { source: string; hash: string };
      expect(row.hash).toBe(createHash("sha256").update(row.source).digest("hex"));
      await expect(persistWorkflow({ ...workflow(), flows: { main: { entry: "ghost", nodes: {} } } }, { db, dir })).rejects.toThrow("invalid workflow");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("enqueues work items carrying the workflow id", () => {
    const db = new DatabaseContext();
    expect(enqueueWork("demo", [{ key: "a", title: "A" }, { title: "B" }], { db })).toEqual(["a", expect.stringMatching(/^wi-/)]);
    const claimed = new QueueService(db).claimTopLevel();
    expect(claimed?.id).toBe("a");
    expect(JSON.parse(String(claimed?.metadata))).toEqual({ workflowId: "demo" });
  });
  it("starts a run for one item or drains the queue", async () => {
    const db = new DatabaseContext();
    const calls: string[] = [];
    expect(await startRun("demo", workflow(), { workItemId: "i1" }, { db, dispatch: async token => { calls.push(token.nodeId); return ok(); } })).toBe("completed");
    expect(calls).toEqual(["first"]);
    expect(new RunRepository(db).get("run-i1").status).toBe("completed");
    enqueueWork("demo", [{ key: "q1", title: "Q" }], { db });
    await startRun("demo", workflow(), {}, { db, dispatch: async () => ok() });
    expect(new RunRepository(db).get("run-q1").status).toBe("completed");
    expect(new QueueService(db).claimTopLevel()).toBeUndefined();
  });
  it("pauses explicitly, blocks redispatch, and resumes through the facade", async () => {
    const db = new DatabaseContext();
    const failing = async (token: { nodeId: string }) => { if (token.nodeId === "second") throw new Error("process stopped"); return ok(); };
    await expect(startRun("two", twoTask(), { workItemId: "i2" }, { db, dispatch: failing })).rejects.toThrow("process stopped");
    pauseRun("run-i2", { db });
    let redispatched = 0;
    expect(await startRun("two", twoTask(), { workItemId: "i2" }, { db, dispatch: async () => { redispatched++; return ok(); } })).toBe("paused");
    expect(redispatched).toBe(0);
    expect(await resumeRun("run-i2", { db, workflow: twoTask(), dispatch: async () => ok() })).toBe("completed");
    expect(new RunRepository(db).get("run-i2").status).toBe("completed");
    expect(runEvents("run-i2", { db }).filter(event => event.type.startsWith("RUN_")).map(event => event.type)).toEqual(["RUN_PAUSED", "RUN_RESUMED"]);
  });
  it("cancels a run, its active tokens, and records the event", async () => {
    const db = new DatabaseContext();
    new RunRepository(db).create("run-c", "demo", "rev");
    new QueueService(db).create({ id: "c", title: "C", body: "", metadata: {} });
    new TokenRepository(db).save({ id: "token-c", runId: "run-c", workItemId: "c", flowId: "main", nodeId: "first", status: "waiting", forkStack: [] });
    cancelRun("run-c", { db });
    expect(new RunRepository(db).get("run-c").status).toBe("cancelled");
    expect(new TokenRepository(db).get("token-c").status).toBe("cancelled");
    expect(runEvents("run-c", { db }).map(event => event.type)).toEqual(["RUN_CANCELLED"]);
  });
  it("rebinds a run actor and lists runs and events", () => {
    const db = new DatabaseContext();
    new RunRepository(db).create("run-r", "demo", "rev");
    rebindRunActor("run-r", "a", "n2", { db });
    rebindRunActor("run-r", "a", "n3", { db });
    expect(db.db.prepare("SELECT node_id FROM run_actor_bindings WHERE run_id='run-r' AND key='a'").get()).toEqual({ node_id: "n3" });
    expect(listRuns({ db }).map(run => run.id)).toContain("run-r");
    const events = runEvents("run-r", { db });
    expect(events.map(event => event.type)).toEqual(["RUN_REBIND", "RUN_REBIND"]);
    expect(JSON.parse(events.at(-1)!.data)).toEqual({ key: "a", nodeId: "n3" });
    expect(() => pauseRun("ghost", { db })).toThrow("run not found");
    expect(() => cancelRun("ghost", { db })).toThrow("run not found");
    expect(() => rebindRunActor("ghost", "a", "n", { db })).toThrow("run not found");
  });
  it("refuses to resume a cancelled run at the facade and the runner", async () => {
    const db = new DatabaseContext();
    new RunRepository(db).create("run-x", "demo", "rev");
    new QueueService(db).create({ id: "x", title: "X", body: "", metadata: {} });
    new TokenRepository(db).save({ id: "token-x", runId: "run-x", workItemId: "x", flowId: "main", nodeId: "first", status: "waiting", forkStack: [] });
    cancelRun("run-x", { db });
    await expect(resumeRun("run-x", { db, workflow: workflow(), dispatch: async () => ok() })).rejects.toThrow("run cancelled");
    expect(new RunRepository(db).get("run-x").status).toBe("cancelled");
    await expect(new WorkflowRunner({ workflow: workflow(), db, dispatch: async () => ok() }).resume("run-x")).rejects.toThrow("run cancelled");
  });
  it("applies run actor rebinds on the wire dispatch path", async () => {
    const db = new DatabaseContext();
    const stale: FeedSnapshot = { epoch: "e", canvas: { connections: [], nodes: [] } };
    const rebound: FeedSnapshot = { epoch: "e", canvas: { connections: [], nodes: [{ id: "m", kind: "terminal", terminal: { id: "t2", nodeId: "n2", name: "Moved", agentType: "x", floorName: "ground", isManager: false, isRunning: true, needsAttention: false, isLive: true, preview: ['[[MAESTRI_FLOW_RESULT]] {"outcome":"ok","summary":"done"}'] } }] } };
    let feed: FeedSnapshot = stale;
    const sent: string[] = [];
    const client = { getFeed: async () => feed, sendPrompt: async (_id: string, text: string) => { sent.push(text); } } as unknown as WireClient;
    expect(await startRun("two", twoTask(), { workItemId: "r1" }, { db, client })).toBe("paused");
    rebindRunActor("run-r1", "a", "n2", { db });
    feed = rebound;
    expect(await resumeRun("run-r1", { db, workflow: twoTask(), client })).toBe("completed");
    expect(sent.length).toBeGreaterThan(0);
    expect(new RunRepository(db).get("run-r1").status).toBe("completed");
  });
  it("claims queue items only for the requested workflow", () => {
    const db = new DatabaseContext();
    enqueueWork("a", [{ key: "a1", title: "A1" }], { db });
    enqueueWork("b", [{ key: "b1", title: "B1" }], { db });
    const queue = new QueueService(db);
    expect(queue.claimTopLevel("b")?.id).toBe("b1");
    expect(queue.claimTopLevel("b")).toBeUndefined();
    expect(queue.claimTopLevel("a")?.id).toBe("a1");
  });
  it("drains only the started workflow's items", async () => {
    const db = new DatabaseContext();
    enqueueWork("a", [{ key: "a1", title: "A1" }], { db });
    enqueueWork("b", [{ key: "b1", title: "B1" }], { db });
    await startRun("b", workflow(), {}, { db, dispatch: async () => ok() });
    expect(new QueueService(db).claimTopLevel()?.id).toBe("a1");
  });
});
