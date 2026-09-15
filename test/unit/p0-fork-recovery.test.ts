import { describe, expect, it } from "vitest";
import { DatabaseContext } from "../../src/persistence/db.js";
import { WorkflowRunner } from "../../src/runner/runner.js";

describe("fork recovery", () => {
  it("does not redispatch a branch already parked at the join", async () => {
    const db = new DatabaseContext();
    const workflow: any = { version: 2, name: "fork", workspace: { id: "w", floor: "ground" }, topology: { mode: "off" }, actors: { a: { label: "A", nodeId: "n" } }, flows: { main: { entry: "fork", nodes: { fork: { type: "parallel", branches: ["b1", "b2"], join: "join" }, b1: { type: "task", actor: "a", outcomes: { ok: "join" } }, b2: { type: "task", actor: "a", outcomes: { ok: "join" } }, join: { type: "join", next: "done" }, done: { type: "terminal", status: "completed" } } } } };
    let fail = true; const firstCalls: string[] = [];
    await expect(new WorkflowRunner({ workflow, db, dispatch: async token => { firstCalls.push(token.nodeId); if (fail && token.nodeId === "b2") throw new Error("crash"); return { outcome: "ok" }; } }).runWorkItem("w", "i")).rejects.toThrow("crash");
    fail = false; const resumedCalls: string[] = [];
    expect(await new WorkflowRunner({ workflow, db, dispatch: async token => { resumedCalls.push(token.nodeId); return { outcome: "ok" }; } }).resume("run-i")).toBe("completed");
    expect(firstCalls).toEqual(["b1", "b2"]); expect(resumedCalls).toEqual(["b2"]);
  });
});
