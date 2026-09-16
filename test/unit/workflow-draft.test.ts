import { describe, expect, it } from "vitest";
import { addTask, addTerminal, bindingsToActors, setOutcome } from "../../src/workflow/draft.js";
import type { WorkflowDefinitionV2 } from "../../src/workflow/schema.js";

const workflow = () => ({ version: 2, name: "demo", workspace: { id: "w", floor: "ground" }, topology: { mode: "off" }, actors: {}, flows: {} }) as unknown as WorkflowDefinitionV2;

describe("workflow draft", () => {
  it("adds a task creating the flow with entry, and appends to existing flows keeping entry", () => {
    const first = addTask(workflow(), "main", "start", { actor: "a", outcomes: {} });
    expect(first.flows.main).toEqual({ entry: "start", nodes: { start: { type: "task", actor: "a", outcomes: {} } } });
    const second = addTask(first, "main", "work", { actor: "a", outcomes: {}, prompt: "do it" });
    expect(second.flows.main.entry).toBe("start");
    expect(second.flows.main.nodes.work).toEqual({ type: "task", actor: "a", outcomes: {}, prompt: "do it" });
  });
  it("adds terminals with an explicit or default completed status", () => {
    const done = addTerminal(workflow(), "main", "done");
    expect(done.flows.main.nodes.done).toEqual({ type: "terminal", status: "completed" });
    const failed = addTerminal(workflow(), "main", "failed", "failed");
    expect(failed.flows.main.nodes.failed).toEqual({ type: "terminal", status: "failed" });
  });
  it("wires an outcome only on task nodes", () => {
    const wired = setOutcome(addTask(workflow(), "main", "start", { actor: "a", outcomes: {} }), "main", "start", "ok", "done");
    expect(wired.flows.main.nodes.start).toMatchObject({ outcomes: { ok: "done" } });
    expect(() => setOutcome(addTerminal(workflow(), "main", "done"), "main", "done", "ok", "x")).toThrow("not a task");
    expect(() => setOutcome(workflow(), "main", "ghost", "ok", "x")).toThrow("not a task");
  });
  it("rejects duplicate node ids and never mutates the input workflow", () => {
    const base = addTask(workflow(), "main", "start", { actor: "a", outcomes: {} });
    const snapshot = JSON.stringify(base);
    expect(() => addTask(base, "main", "start", { actor: "b", outcomes: {} })).toThrow("already exists");
    setOutcome(base, "main", "start", "ok", "done");
    addTerminal(base, "main", "done");
    expect(JSON.stringify(base)).toBe(snapshot);
  });
  it("maps actor bindings to workflow actors", () => {
    expect(bindingsToActors({ a: { key: "a", label: "Alpha", nodeId: "n1", snapshot: { terminalName: "T" } } })).toEqual({ a: { label: "Alpha", nodeId: "n1" } });
  });
});
