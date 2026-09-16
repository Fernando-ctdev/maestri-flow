import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { App, type RunSnapshot } from "../../src/tui/app.js";
import type { WorkflowDefinitionV2 } from "../../src/workflow/schema.js";
import { resolveLanguage } from "../../src/config/language.js";

describe("configure TUI shell", () => {
  it("renders connection, sidebar, main panel and shortcuts", () => {
     const view = render(<App onQuit={() => undefined} />);
     expect(view.lastFrame()).toContain("MAESTRI FLOW"); expect(view.lastFrame()).toContain("TELAS"); expect(view.lastFrame()).toContain("Conectar ao Wire"); expect(view.lastFrame()).toContain("1–7 ir");
  });
  it("navigates with keyboard and renders empty state", async () => {
    const view = render(<App language="en" onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    view.stdin.write("n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain("Provisioning");
    view.stdin.write("3");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain("Live canvas");
    expect(view.lastFrame()).toContain("No canvas snapshot yet");
  });
  it("renders loading and error states", () => {
    const view = render(<App language="en" initial={{ screen: "canvas", actorBindings: {}, validation: [], connection: "loading", error: "feed unavailable" }} onQuit={() => undefined} />); expect(view.lastFrame()).toContain("Loading live state"); expect(view.lastFrame()).toContain("Error: feed unavailable");
  });
  it("resolves language by flag, environment, config and default", () => {
    expect(resolveLanguage({ env: {} })).toBe("pt-BR");
    expect(resolveLanguage({ env: { MAESTRI_FLOW_LANGUAGE: "en" } })).toBe("en");
    expect(resolveLanguage({ flag: "en", env: { MAESTRI_FLOW_LANGUAGE: "pt-BR" } })).toBe("en");
    const directory = mkdtempSync(join(tmpdir(), "maestri-flow-i18n-"));
    try {
      const configPath = join(directory, "config.json");
      writeFileSync(configPath, JSON.stringify({ language: "en" }));
      expect(resolveLanguage({ env: {}, configPath })).toBe("en");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each([
    ["provisioning", "Provisionador não configurado"],
    ["canvas", "Feed do canvas não configurado"],
    ["review", "Persistência não configurada"],
  ] as const)("Enter on %s reports a blocked action", async (screen, message) => {
    const view = render(<App initial={{ screen, actorBindings: {}, validation: [] }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain(message);
  });
  it("keeps the connection form open when pairing fails", async () => {
    const view = render(<App language="en" actions={{ connect: async () => { throw new Error("invalid pairing code"); } }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const character of "123456") view.stdin.write(character);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(view.lastFrame()).toContain("SPKI SHA-256");
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(view.lastFrame()).toContain("Invalid value: SPKI SHA-256 must be 32-byte hex or Base64");
    const securityKey = "00".repeat(32);
    view.stdin.write(securityKey);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(view.lastFrame()).toContain("Configure Wire");
    expect(view.lastFrame()).toContain("Error: invalid pairing code");
  });
  it("normalizes pasted hexadecimal SPKI before pairing", async () => {
    let pairedConfig: { serverKeyHash?: string } | undefined;
    const view = render(<App language="en" actions={{ connect: async config => { pairedConfig = config; } }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const character of "123456") view.stdin.write(character);
    await new Promise((resolve) => setTimeout(resolve, 80));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    const securityKey = "00".repeat(32);
    view.stdin.write(securityKey);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pairedConfig?.serverKeyHash).toBe(Buffer.from(securityKey, "hex").toString("base64"));
    expect(view.lastFrame()).toContain("CONNECTED");
  });
  it("passes a pasted 32-byte Base64 SPKI unchanged to pairing", async () => {
    let pairedConfig: { serverKeyHash?: string } | undefined;
    const pin = Buffer.alloc(32, 1).toString("base64");
    const view = render(<App language="en" actions={{ connect: async config => { pairedConfig = config; } }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const character of "123456") view.stdin.write(character);
    await new Promise((resolve) => setTimeout(resolve, 80));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    view.stdin.write(pin);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pairedConfig?.serverKeyHash).toBe(pin);
    expect(view.lastFrame()).toContain("CONNECTED");
  });
  it("renders an actionable connection entry in English", () => {
    const view = render(<App language="en" initial={{ screen: "connect", actorBindings: {}, validation: [], connection: "idle" }} onQuit={() => undefined} />);
    expect(view.lastFrame()).toContain("READY");
    expect(view.lastFrame()).toContain("Press Enter to test the connection");
  });
  it("Enter on Connect opens the Wire configuration form", async () => {
    const view = render(<App language="en" onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain("Configure Wire");
    expect(view.lastFrame()).toContain("Pairing code");
    expect(view.lastFrame()).toContain("SPKI SHA-256");
    expect(view.lastFrame()).not.toContain("DISABLED");
  });
  const workspaces = [{ id: "ws-alpha", name: "Alpha" }, { id: "ws-beta", name: "Beta" }];
  it("Enter on canvas without a workspace shows the explicit workspace picker", async () => {
    const view = render(<App language="en" initial={{ screen: "canvas", actorBindings: {}, validation: [] }} actions={{ listWorkspaces: async () => workspaces, selectWorkspace: async () => { throw new Error("must not pick before Enter"); } }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain("Select a workspace");
    expect(view.lastFrame()).toContain("Alpha");
    expect(view.lastFrame()).toContain("Beta");
  });
  it("Enter on the picker selects the highlighted workspace", async () => {
    const selected: string[] = [];
    const view = render(<App language="en" initial={{ screen: "canvas", actorBindings: {}, validation: [] }} actions={{ listWorkspaces: async () => workspaces, selectWorkspace: async (id) => { selected.push(id); return { workspace: id, discovery: { terminals: [], connections: [] } }; } }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(selected).toEqual(["ws-alpha"]);
    expect(view.lastFrame()).toContain("ws-alpha");
    expect(view.lastFrame()).not.toContain("Select a workspace");
  });
  it("selecting a workspace on provisioning opens the brief form", async () => {
    const view = render(<App language="en" initial={{ screen: "provisioning", actorBindings: {}, validation: [] }} actions={{ listWorkspaces: async () => workspaces, selectWorkspace: async (id) => ({ workspace: id, discovery: { terminals: [], connections: [] } }) }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain("Brief: _ · Enter envia · Esc cancela");
  });
});

describe("configure TUI screens", () => {
  const terminal = (id: string, nodeId: string, name: string) => ({ id, nodeId, name, agentType: "claude", floorName: "base", isManager: false, isRunning: true, needsAttention: false, isLive: true, preview: [], connectedNodeIds: [] });
  const discovery = { terminals: [terminal("t1", "node-1", "Alpha"), terminal("t2", "node-2", "Beta")], connections: [] };
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const draft: WorkflowDefinitionV2 = {
    version: 2, name: "draft", workspace: { id: "ws", floor: "base" }, topology: { mode: "advisory" },
    actors: { impl: { label: "impl", nodeId: "node-1" } },
    flows: { main: { entry: "task1", nodes: { task1: { type: "task", actor: "impl", outcomes: { ok: "done1" } }, done1: { type: "terminal", status: "completed" } } } },
  };
  it("Enter on bindings lists discovery terminals and binds an actor key", async () => {
    const view = render(<App language="en" initial={{ screen: "bindings", actorBindings: {}, validation: [], discovery }} onQuit={() => undefined} />);
    await wait(20);
    view.stdin.write("\r");
    await wait(20);
    expect(view.lastFrame()).toContain("Select a terminal");
    expect(view.lastFrame()).toContain("Alpha (node-1)");
    expect(view.lastFrame()).toContain("Beta (node-2)");
    view.stdin.write("j");
    await wait(20);
    view.stdin.write("\r");
    await wait(20);
    expect(view.lastFrame()).toContain("Actor key for the selected terminal");
    for (const character of "impl") view.stdin.write(character);
    await wait(20);
    view.stdin.write("\r");
    await wait(30);
    expect(view.lastFrame()).toContain("1 binding(s)");
    expect(view.lastFrame()).toContain("impl → node-2");
  });
  it("number keys select terminals in the actors picker", async () => {
    const view = render(<App language="en" initial={{ screen: "bindings", actorBindings: {}, validation: [], discovery }} onQuit={() => undefined} />);
    await wait(20);
    view.stdin.write("\r");
    await wait(20);
    view.stdin.write("2");
    await wait(20);
    for (const character of "dev") view.stdin.write(character);
    await wait(20);
    view.stdin.write("\r");
    await wait(30);
    expect(view.lastFrame()).toContain("dev → node-2");
  });
  it("workflow keys stage task, terminal and outcome in the draft", async () => {
    const view = render(<App language="en" initial={{ screen: "workflow", actorBindings: {}, validation: [] }} onQuit={() => undefined} />);
    await wait(20);
    view.stdin.write("t");
    await wait(20);
    expect(view.lastFrame()).toContain("Task (actor): _");
    for (const character of "impl") view.stdin.write(character);
    await wait(20);
    view.stdin.write("\r");
    await wait(20);
    expect(view.lastFrame()).toContain("task1: task[impl]");
    view.stdin.write("x");
    await wait(20);
    expect(view.lastFrame()).toContain("done2: terminal[completed]");
    view.stdin.write("o");
    await wait(20);
    expect(view.lastFrame()).toContain("Outcome (format: outcome target)");
    for (const character of "ok done2") view.stdin.write(character);
    await wait(20);
    view.stdin.write("\r");
    await wait(20);
    expect(view.lastFrame()).toContain("task1: task[impl] ok→done2");
  });
  it("Enter on review with a draft validates and shows issues without persisting", async () => {
    let persisted = 0;
    const view = render(<App language="en" initial={{ screen: "review", actorBindings: {}, validation: [], draftWorkflow: draft }} onQuit={() => undefined} actions={{ validateWorkflow: () => [{ severity: "error", code: "missing-entry", message: "entry node missing" }], persistWorkflow: () => { persisted += 1; } }} />);
    await wait(20);
    view.stdin.write("\r");
    await wait(50);
    expect(view.lastFrame()).toContain("- entry node missing");
    expect(view.lastFrame()).toContain("1 issue(s)");
    expect(persisted).toBe(0);
  });
  it("Enter on review with a clean draft persists the workflow", async () => {
    const persisted: WorkflowDefinitionV2[] = [];
    const view = render(<App language="en" initial={{ screen: "review", actorBindings: {}, validation: [], draftWorkflow: draft }} onQuit={() => undefined} actions={{ validateWorkflow: () => [], persistWorkflow: workflow => { persisted.push(workflow); } }} />);
    await wait(20);
    view.stdin.write("\r");
    await wait(50);
    expect(persisted).toEqual([draft]);
    expect(view.lastFrame()).toContain("Workflow saved");
  });
  it("Enter on review without a draft still confirms a staged proposal", async () => {
    const confirmed: string[] = [];
    const view = render(<App language="en" initial={{ screen: "review", actorBindings: {}, validation: [], stagedProvisioningProposal: { workItems: [{ key: "wi-1", title: "Ship" }] } }} onQuit={() => undefined} actions={{ confirmProposal: proposal => { confirmed.push(proposal.workItems[0].key); } }} />);
    await wait(20);
    view.stdin.write("\r");
    await wait(50);
    expect(confirmed).toEqual(["wi-1"]);
    expect(view.lastFrame()).toContain("Proposta aplicada na fila");
  });
  it("run screen polls listRuns and shows status, tokens and task results", async () => {
    let polls = 0;
    const runs: RunSnapshot[] = [{ id: "run-1", status: "running", tokens: [{ flowId: "main", nodeId: "node-1", status: "running" }], events: [{ type: "TASK_RESULT", data: '{"outcome":"ok"}' }] }];
    const view = render(<App language="en" initial={{ screen: "run", actorBindings: {}, validation: [] }} onQuit={() => undefined} actions={{ listRuns: () => { polls += 1; return runs; } }} />);
    await wait(1300);
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(view.lastFrame()).toContain("run-1: running");
    expect(view.lastFrame()).toContain("node-1/running");
    expect(view.lastFrame()).toContain("TASK_RESULT");
    view.unmount();
  });
  it("paused runs expose resume, cancel and rebind actions", async () => {
    const calls: string[] = [];
    const rebound: { runId: string; actorKey: string; nodeId: string }[] = [];
    const runs: RunSnapshot[] = [{ id: "run-1", status: "paused", tokens: [{ flowId: "main", nodeId: "task1", status: "ready" }], events: [] }];
    const view = render(<App language="en" initial={{ screen: "run", actorBindings: { impl: { key: "impl", label: "impl", nodeId: "node-1" } }, validation: [], discovery, draftWorkflow: draft }} onQuit={() => undefined} actions={{
      listRuns: () => runs,
      resumeRun: runId => { calls.push(`resume:${runId}`); },
      cancelRun: runId => { calls.push(`cancel:${runId}`); },
      rebindRunActor: input => { rebound.push(input); },
    }} />);
    await wait(20);
    expect(view.lastFrame()).toContain("Run paused: r resume · c cancel · a rebind actor");
    view.stdin.write("r");
    await wait(30);
    view.stdin.write("c");
    await wait(30);
    expect(calls).toEqual(["resume:run-1", "cancel:run-1"]);
    view.stdin.write("a");
    await wait(20);
    expect(view.lastFrame()).toContain("Select a terminal");
    view.stdin.write("j");
    await wait(20);
    view.stdin.write("\r");
    await wait(30);
    expect(rebound).toEqual([{ runId: "run-1", actorKey: "impl", nodeId: "node-2" }]);
    view.unmount();
  });
  it("rebind resolves the actor from the workflow node, not from canvas node ids", async () => {
    const rebound: { runId: string; actorKey: string; nodeId: string }[] = [];
    const reviewDraft: WorkflowDefinitionV2 = {
      ...draft,
      actors: { impl: { label: "impl", nodeId: "NODE-A" }, review: { label: "review", nodeId: "NODE-B" } },
      flows: { main: { entry: "task1", nodes: { task1: { type: "task", actor: "review", outcomes: { ok: "done1" } }, done1: { type: "terminal", status: "completed" } } } },
    };
    const runs: RunSnapshot[] = [{ id: "run-1", status: "paused", tokens: [{ flowId: "main", nodeId: "task1", status: "ready" }], events: [] }];
    const view = render(<App language="en" initial={{ screen: "run", actorBindings: { impl: { key: "impl", label: "impl", nodeId: "NODE-A" }, review: { key: "review", label: "review", nodeId: "NODE-B" } }, validation: [], discovery, draftWorkflow: reviewDraft }} onQuit={() => undefined} actions={{
      listRuns: () => runs,
      rebindRunActor: input => { rebound.push(input); },
    }} />);
    await wait(20);
    view.stdin.write("a");
    await wait(20);
    expect(view.lastFrame()).toContain("Select a terminal");
    view.stdin.write("\r");
    await wait(30);
    expect(rebound).toEqual([{ runId: "run-1", actorKey: "review", nodeId: "node-1" }]);
    view.unmount();
  });
  it("warnings do not block saving a workflow draft", async () => {
    let persisted = 0;
    const view = render(<App language="en" initial={{ screen: "review", actorBindings: {}, validation: [], draftWorkflow: draft }} onQuit={() => undefined} actions={{ validateWorkflow: () => [{ severity: "warning", code: "same-node-binding", message: "actors share a canvas node" }], persistWorkflow: () => { persisted += 1; } }} />);
    await wait(20);
    view.stdin.write("\r");
    await wait(50);
    expect(view.lastFrame()).toContain("1 issue(s)");
    expect(persisted).toBe(1);
    expect(view.lastFrame()).toContain("Workflow saved");
  });
  it("Enter on run screen enqueues work and starts a run from the saved draft", async () => {
    const enqueued: { title: string }[] = [];
    const started: { workItemId: string }[] = [];
    const view = render(<App language="en" initial={{ screen: "run", actorBindings: {}, validation: [], draftWorkflow: draft }} onQuit={() => undefined} actions={{
      enqueueWork: input => { enqueued.push(input); return "wi-1"; },
      startRun: input => { started.push(input); },
    }} />);
    await wait(20);
    view.stdin.write("\r");
    await wait(30);
    expect(enqueued).toEqual([{ workflow: draft, title: "draft" }]);
    expect(started).toEqual([{ workflow: draft, workItemId: "wi-1" }]);
    expect(view.lastFrame()).toContain("Run started");
  });
  it("p pauses a running run", async () => {
    const paused: string[] = [];
    const runs: RunSnapshot[] = [{ id: "run-1", status: "running", tokens: [], events: [] }];
    const view = render(<App language="en" initial={{ screen: "run", actorBindings: {}, validation: [] }} onQuit={() => undefined} actions={{ listRuns: () => runs, pauseRun: runId => { paused.push(runId); } }} />);
    await wait(20);
    view.stdin.write("p");
    await wait(30);
    expect(paused).toEqual(["run-1"]);
    view.unmount();
  });
});
