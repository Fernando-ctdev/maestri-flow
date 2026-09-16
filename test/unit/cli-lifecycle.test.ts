import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseContext } from "../../src/persistence/db.js";
import { RunRepository } from "../../src/persistence/repositories.js";
import { createCli } from "../../src/cli/index.js";
import type { WireClient } from "../../src/wire/client.js";
import { listRuns } from "../../src/runner/lifecycle.js";
import type { WorkflowDefinitionV2 } from "../../src/workflow/schema.js";

const workflow = () => ({ version: 2, name: "Demo Flow", workspace: { id: "w", floor: "ground" }, topology: { mode: "off" }, actors: { a: { label: "A", nodeId: "n" } }, flows: { main: { entry: "first", nodes: { first: { type: "task", actor: "a", outcomes: { ok: "done" } }, done: { type: "terminal", status: "completed" } } } } }) satisfies WorkflowDefinitionV2;

describe("cli lifecycle commands", () => {
  it("enqueues and runs a workflow through the facade", async () => {
    const db = new DatabaseContext();
    const dir = mkdtempSync(join(tmpdir(), "maestri-cli-"));
    const output: string[] = [];
    try {
      const cli = createCli({ db, dir, write: value => output.push(value), workflow: async () => workflow(), dispatch: async () => ({ status: "OK", outcome: "ok" }) });
      await cli.parseAsync(["node", "maestri-flow", "enqueue", "demo.yaml", "--title", "First"], { from: "node" });
      expect(JSON.parse(output.at(-1)!).items).toHaveLength(1);
      await cli.parseAsync(["node", "maestri-flow", "run", "demo.yaml"], { from: "node" });
      expect(JSON.parse(output.at(-1)!).status).toBe("drained");
      expect(listRuns({ db })).toEqual([expect.objectContaining({ status: "completed" })]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("pauses, rebinds and cancels a run", async () => {
    const db = new DatabaseContext();
    new RunRepository(db).create("run-1", "demo", "rev");
    const output: string[] = [];
    const cli = createCli({ db, write: value => output.push(value) });
    await cli.parseAsync(["node", "maestri-flow", "pause", "run-1"], { from: "node" });
    expect(JSON.parse(output.at(-1)!).status).toBe("paused");
    await cli.parseAsync(["node", "maestri-flow", "rebind", "run-1", "a", "n9"], { from: "node" });
    expect(JSON.parse(output.at(-1)!)).toEqual({ runId: "run-1", key: "a", nodeId: "n9" });
    await cli.parseAsync(["node", "maestri-flow", "cancel", "run-1"], { from: "node" });
    expect(JSON.parse(output.at(-1)!).status).toBe("cancelled");
  });
  it("provisions through a live manager", async () => {
    const feed = { epoch: "e", canvas: { connections: [], nodes: [{ id: "m", kind: "terminal", terminal: { id: "t", nodeId: "manager", name: "Maestro", agentType: "x", floorName: "ground", isManager: true, isRunning: true, needsAttention: false, isLive: true, preview: ['[[MAESTRI_FLOW_PROVISIONING_RESULT]] {"workItems":[{"key":"a","title":"A"}]}'] } }] } };
    // Structural fake: only the two methods the provisioning path calls.
    const client = { getFeed: async () => feed, sendPrompt: async () => undefined } as unknown as WireClient;
    const output: string[] = [];
    const cli = createCli({ client, write: value => output.push(value) });
    await cli.parseAsync(["node", "maestri-flow", "provision", "--workspace", "w", "--brief", "make items"], { from: "node" });
    expect(JSON.parse(output.at(-1)!)).toEqual({ status: "completed", staged: [{ key: "a", title: "A" }] });
  });
});
