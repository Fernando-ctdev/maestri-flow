# Maestri Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic, interactive workflow engine for Maestri that optionally uses a Maestro terminal as a natural-language team provisioner, discovers the resulting live canvas through Wire, lets the user bind arbitrary logical actors to real canvas terminal nodes, lets the user author arbitrary workflows in a TUI, and executes those workflows deterministically with durable loops, parallel branches, joins, subflows, retries and work queues.

**Architecture:** The product has six boundaries: `wire/` discovers and controls Maestri; `canvas/` turns the live feed into stable terminal/node topology; `provisioning/` optionally sends a natural-language brief to a user-selected `isManager` Maestro and stages its handoff while trusting the refreshed Wire canvas as source of truth; `tui/` creates user-owned actor bindings and workflow graphs; `engine/` is a pure persisted token-based graph executor with no Maestri/domain semantics; `runner/` resolves bound `nodeId` values to current terminal route ids and dispatches work through Wire. SQLite persists queue/run/token/fork/subflow state. Maestro may provision, but no LLM may decide the next workflow node during a managed run.

**Tech Stack:** Node.js 20+, TypeScript 5.x, ESM, Commander, Ink + React for the TUI, Zod, YAML, better-sqlite3, ws, Pino, Vitest, Ink Testing Library, a small self-signed TLS test fixture/server for Wire contract tests.

**Spec:** `docs/superpowers/specs/2026-09-15-maestri-flow-design.md`

## Global Constraints

- Target the official Maestri Wire contract documented at `https://www.themaestri.app/en/docs/wire`.
- Require Wire `protocolVersion === 1`; fail closed on incompatible versions.
- Require `feedSnapshots`, `canvasMirroring`, and `terminalStreaming` for execution.
- Pair as a clearly named Full control / `owner` device because terminal prompt dispatch is a write operation.
- Bind workflow actors to **canvas `nodeId`**, never terminal display name and never inferred role semantics.
- Resolve the current `TerminalCard.id` from the live feed immediately before dispatch.
- The runtime has zero built-in concepts named developer, reviewer, architect, QA, researcher, writer, etc.
- User-created actor keys, node ids, outcome names and labels are opaque strings to the engine.
- Canvas topology never defines workflow direction. Workflow configuration is authoritative.
- Topology validation modes are `strict`, `advisory`, and `off`; default is `advisory`.
- Cycles are legal and intentional.
- Engine node types in V1: `task`, `parallel`, `join`, `foreach`, and `terminal`.
- `parallel`/`join` state is persisted by fork instance; a join must complete exactly once per fork.
- `foreach` executes child work items through a named subflow and waits according to configured concurrency/completion behavior.
- Top-level queue draining only claims parentless pending work items; child items are controlled by `foreach`.
- State changes that affect continuation must commit to SQLite before another dispatch occurs.
- Result advancement requires `[[MAESTRI_FLOW_RESULT]]` with an outcome declared by the current `task` node.
- The engine never infers outcomes from prose and never invents transitions.
- A stale canvas binding pauses the run and is repaired by rebind; it does not silently choose another terminal.
- `401` from Wire is not retried indefinitely; require pairing again.
- A changed Wire feed `epoch` invalidates cached state and triggers a full snapshot resync.
- Pending interactive Y/n prompts pause managed execution by default; no arbitrary auto-approval.
- Wire TLS uses SPKI pinning after pairing; permanent `rejectUnauthorized: false` is forbidden.
- Credentials/tokens are never written to workflow YAML or committed to Git.
- V1 configures one workspace/floor per workflow profile. Cross-floor workflow execution is a later extension.
- Maestro-assisted provisioning is optional; manual canvas/TUI configuration remains fully supported.
- Discover Maestro provisioning candidates only from live `TerminalCard.isManager === true`; bind the selected provisioner by canvas `nodeId`.
- A provisioner is out-of-band from the workflow graph by default. It may recruit/re-role/connect/organize the team, but it never selects runtime transitions.
- The refreshed Wire feed after provisioning is authoritative; never trust an LLM claim that a terminal or connection exists.
- Structured work items proposed by Maestro are staged and require validation/user confirmation before queue insertion.
- Actor ids, node ids, terminal ids and workflow transitions are never accepted from Maestro prose/result payloads.
- At managed-run start, persist the workflow revision + actor bindings. Relevant bound-node removal/replacement pauses the run until explicit rebind/revalidation.

---

## Target File Structure

```text
maestri-flow/
  src/
    cli/
      index.ts                    # command tree
      output.ts                   # text/json rendering
    config/
      paths.ts                    # config/data locations
      credentials.ts              # paired host secret + SPKI metadata
      profiles.ts                 # saved host/workspace/workflow profile metadata
    wire/
      types.ts                    # narrow Wire contract types used by this product
      tls-pin.ts                  # SPKI fingerprint verification
      client.ts                   # HTTPS API client + pairing/info/workspaces/prompt
      feed.ts                     # feed snapshot/WS synchronization + epoch handling
      terminal-stream.ts          # terminal WS stream and bounded capture
    canvas/
      discovery.ts                # selected floor terminal/connection model
      bindings.ts                 # actor binding resolution/rebinding
      topology.ts                 # connection graph + strict/advisory checks
    provisioning/
      types.ts                    # provisioner binding + staged handoff types
      result-protocol.ts          # optional Maestro provisioning envelope parser
      service.ts                  # prompt Maestro, observe feed delta, stage handoff
    workflow/
      schema.ts                   # version 2 generic workflow schema
      loader.ts                   # YAML load/save
      validator.ts                # graph/static validation
      projection.ts               # actor-hop projection for topology validation
      result-protocol.ts          # explicit result marker parser
    engine/
      types.ts                    # token/fork/subflow/domain-neutral engine types
      reducer.ts                  # pure token transition reducer
      parallel.ts                 # fork/join pure helpers
      foreach.ts                  # subflow/child scheduling pure helpers
    persistence/
      db.ts                       # sqlite connection/transaction wrapper
      migrations.ts               # schema creation/migration
      repositories.ts             # durable storage API
    queue/
      service.ts                  # parent/child work item operations
    runner/
      prompt.ts                   # engine-owned result contract injection
      dispatch.ts                 # task dispatch and result collection
      scheduler.ts                # runnable token/subflow scheduling
      recovery.ts                 # retry/pause/reconnect policy
      runner.ts                   # queue + run orchestration
    tui/
      app.tsx
      state.ts                    # pure configuration wizard state/reducer
      screens/
        ConnectScreen.tsx
        ProvisioningScreen.tsx
        CanvasScreen.tsx
        ActorBindingsScreen.tsx
        WorkflowBuilderScreen.tsx
        ReviewScreen.tsx
        RebindScreen.tsx
        EnqueueScreen.tsx
      components/
        TerminalList.tsx
        ActorEditor.tsx
        NodeEditor.tsx
        TransitionEditor.tsx
        ValidationPanel.tsx
    index.ts
  test/
    unit/
      workflow-schema.test.ts
      workflow-validator.test.ts
      workflow-projection.test.ts
      result-protocol.test.ts
      canvas-discovery.test.ts
      actor-bindings.test.ts
      topology.test.ts
      provisioning.test.ts
      engine-reducer.test.ts
      engine-parallel.test.ts
      engine-foreach.test.ts
      persistence.test.ts
      queue.test.ts
      recovery.test.ts
      tui-state.test.ts
    integration/
      wire-client.test.ts
      maestro-provisioning.test.ts
      configure-flow.test.tsx
      runner-cycle.test.ts
      runner-parallel.test.ts
      runner-rebind.test.ts
      runner-foreach.test.ts
      runner-resume.test.ts
      queue-drain.test.ts
    support/
      fake-wire-server.ts
      fake-wire-transport.ts
      fixtures.ts
  examples/
    cyclic-review.yaml
    parallel-checks.yaml
    parent-child.yaml
  .gitignore
  package.json
  package-lock.json
  tsconfig.json
  vitest.config.ts
  README.md
```

The code boundaries are mandatory: `engine/` imports no Wire, TUI, SQLite or Maestri-specific code; `wire/` knows nothing about workflow semantics; `provisioning/` may use Wire/canvas models but cannot import or invoke engine transition logic; `tui/` edits definitions and provisioning handoff state but never executes workflow transitions; only `runner/` coordinates managed execution boundaries.

---

### Task 1: Bootstrap the TypeScript CLI/TUI project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/index.ts`
- Create: `src/cli/index.ts`
- Create: `src/cli/output.ts`
- Create: `src/config/paths.ts`
- Test: `test/unit/paths.test.ts`

**Interfaces:**
- Produces `maestri-flow` executable.
- Produces `getConfigDir()`, `getDataDir()`, `getWorkflowDir()`, `getDatabasePath()`.

- [ ] **Step 1: Create package metadata and install runtime dependencies**

Create an ESM package with Node `>=20`, bin entry `dist/cli/index.js`, and scripts:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/cli/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

Install runtime dependencies with npm so the lockfile records exact resolved versions:

```bash
npm install commander ink react ink-select-input ink-text-input zod yaml better-sqlite3 ws pino
npm install -D typescript tsx vitest @types/node @types/react @types/ws @types/better-sqlite3 ink-testing-library selfsigned
```

- [ ] **Step 2: Write failing path tests**

Test that explicit `MAESTRI_FLOW_HOME` overrides platform defaults and that workflows/data/credentials are kept under separate paths.

```ts
expect(getWorkflowDir({ MAESTRI_FLOW_HOME: "/tmp/mf" })).toBe("/tmp/mf/workflows");
expect(getDatabasePath({ MAESTRI_FLOW_HOME: "/tmp/mf" })).toBe("/tmp/mf/state.db");
```

- [ ] **Step 3: Run the path test and verify failure**

```bash
npm test -- test/unit/paths.test.ts
```

Expected: FAIL because path helpers do not exist.

- [ ] **Step 4: Implement focused path helpers and CLI shell**

`src/cli/index.ts` creates Commander commands named `version`, `pair`, `configure`, `inspect-canvas`, `validate`, `enqueue`, `run`, `status`, `pause`, `resume`, `cancel`, and `rebind`. Commands other than `version` may initially throw `Not implemented`.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck
npm test -- test/unit/paths.test.ts
npm run build
git add .
git commit -m "chore: bootstrap generic maestri flow runtime"
```

---

### Task 2: Model the official Wire protocol boundary and secure pairing

**Files:**
- Create: `src/wire/types.ts`
- Create: `src/wire/tls-pin.ts`
- Create: `src/wire/client.ts`
- Create: `src/config/credentials.ts`
- Test: `test/integration/wire-client.test.ts`
- Support: `test/support/fake-wire-server.ts`

**Interfaces:**
- `WireClient.getInfo(): Promise<WireInfo>`
- `WireClient.pair(input): Promise<PairResult>`
- `WireClient.listWorkspaces(): Promise<WorkspaceMeta[]>`
- `WireClient.getFeed(workspaceId, floor): Promise<FeedSnapshot>`
- `WireClient.sendPrompt(terminalId, text): Promise<void>`
- Credentials store `{ host, port, token, deviceId, serverKeyHash, protocolVersion }`.

- [ ] **Step 1: Write a fake HTTPS Wire server**

The fixture serves a self-signed certificate and implements `/api/info`, `/pair`, `/api/workspaces`, `/api/workspaces/:ws/feed`, and terminal prompt capture. It must be able to emit `401`, `403`, `409`, capabilities and arbitrary protocol versions.

- [ ] **Step 2: Write failing pairing/protocol tests**

Required cases:

```text
accept protocolVersion 1
reject protocolVersion 2
reject missing feedSnapshots
reject missing canvasMirroring
reject missing terminalStreaming for execution
store returned bearer token without writing it to workflow files
stop retry policy on 401
```

- [ ] **Step 3: Implement narrow Wire types**

Model only documented fields the runtime uses, including:

```ts
interface TerminalCard {
  id: string;
  nodeId: string;
  name: string;
  agentType: string;
  roleName?: string;
  floorId?: string;
  floorName: string;
  isManager: boolean;
  isRunning: boolean;
  isActive?: boolean;
  needsAttention: boolean;
  isLive: boolean;
  isUnloaded?: boolean;
  preview: string[];
}

interface Connection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: string;
  isActive: boolean;
}
```

Treat unknown enum strings as valid unknown values.

- [ ] **Step 4: Implement SPKI pin validation**

Expose a pure helper that computes/verifies the SHA-256 of certificate SubjectPublicKeyInfo and compare against stored `serverKeyHash`. Pairing may use an explicit one-time insecure/bootstrap path only when the user provides/verifies the security key; normal API calls must use pinning.

- [ ] **Step 5: Implement credentials persistence**

Store secrets under the config directory with restrictive file permissions where the OS permits. Never serialize `token` in logs or workflow YAML.

- [ ] **Step 6: Implement `WireClient` and verify**

Run:

```bash
npm test -- test/integration/wire-client.test.ts
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/wire src/config test
 git commit -m "feat: add secure maestri wire client"
```

---

### Task 3: Synchronize the live Wire feed and canvas snapshot

**Files:**
- Create: `src/wire/feed.ts`
- Create: `src/wire/terminal-stream.ts`
- Test: `test/unit/canvas-discovery.test.ts`
- Extend: `test/support/fake-wire-server.ts`

**Interfaces:**
- `FeedSession.start()` emits authoritative `FeedSnapshot` updates.
- `FeedSession.current()` returns the latest snapshot.
- `TerminalStream.capture(terminalId, options)` returns bounded decoded terminal text/events.

- [ ] **Step 1: Extend fake Wire with feed and terminal WebSockets**

Support full snapshots, mutation messages, `epoch` changes, raw terminal frames and close/reconnect behavior.

- [ ] **Step 2: Write failing feed tests**

Verify:

- first snapshot becomes current;
- same-epoch snapshots replace prior snapshot;
- changed `epoch` clears cached assumptions and emits a resync event;
- unknown socket message types are ignored;
- reconnect preserves no stale snapshot as authoritative before the next full snapshot.

- [ ] **Step 3: Implement feed synchronization**

Do not reconstruct canvas state from mutation events. Per Wire contract, snapshots remain source of truth. Mutation events may be exposed for diagnostics only.

- [ ] **Step 4: Implement bounded terminal capture**

Keep a bounded UTF-8 text buffer sufficient for result extraction, not a permanent PTY log.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- test/unit/canvas-discovery.test.ts test/integration/wire-client.test.ts
git add src/wire test
git commit -m "feat: synchronize wire feed and terminal streams"
```

---
