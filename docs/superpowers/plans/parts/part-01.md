Keep a bounded UTF-8 text buffer sufficient for result extraction, not a permanent PTY log.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- test/unit/canvas-discovery.test.ts test/integration/wire-client.test.ts
git add src/wire test
git commit -m "feat: synchronize wire feed and terminal streams"
```

---

### Task 4: Discover canvas terminals and build a domain-neutral topology model

**Files:**
- Create: `src/canvas/discovery.ts`
- Create: `src/canvas/topology.ts`
- Test: `test/unit/canvas-discovery.test.ts`
- Test: `test/unit/topology.test.ts`

**Interfaces:**

```ts
interface CanvasTerminal {
  nodeId: string;
  terminalId: string;
  name: string;
  agentType: string;
  roleName?: string;
  connectedNodeIds: string[];
  isRunning: boolean;
}

function discoverCanvas(snapshot: FeedSnapshot): CanvasDiscovery;
function areCanvasNodesConnected(discovery, aNodeId, bNodeId): boolean;
```

- [ ] **Step 1: Write failing discovery tests**

Use terminals named `Alpha`, `Bruttus`, and `Anything At All` to prove discovery does not classify semantic roles from names.

- [ ] **Step 2: Implement discovery from `snapshot.canvas.nodes`**

Only terminal nodes on the selected canvas become selectable actors. Keep notes/files/etc. available as topology metadata but never bind them as task actors in V1.

- [ ] **Step 3: Implement undirected cable lookup**

A canvas cable is considered present regardless of `fromNodeId`/`toNodeId` ordering. This helper does not imply workflow direction.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- test/unit/canvas-discovery.test.ts test/unit/topology.test.ts
git add src/canvas test
git commit -m "feat: discover live canvas topology"
```

---

### Task 5: Define stable user-owned actor bindings by canvas node id

**Files:**
- Create: `src/canvas/bindings.ts`
- Test: `test/unit/actor-bindings.test.ts`

**Interfaces:**

```ts
interface ActorBinding {
  key: string;
  label: string;
  nodeId: string;
  snapshot?: {
    terminalName?: string;
    roleName?: string;
    agentType?: string;
  };
}

function resolveActor(binding, discovery): ResolvedActor | StaleBinding;
function rebindActor(binding, newNodeId, discovery): ActorBinding;
```

- [ ] **Step 1: Write failing tests proving names are non-authoritative**

Cases:

1. Bind actor `worker-x` to node `NODE-1` whose terminal name is `Bruttus`.
2. Rename terminal to `Banana` while keeping `NODE-1`.
3. Resolve successfully to the new terminal route id.
4. Remove `NODE-1`; resolution returns `stale`, never chooses a similarly named terminal.

- [ ] **Step 2: Implement binding resolution/rebinding**

Multiple logical actors may intentionally bind to the same terminal node; return a warning, not an error.

- [ ] **Step 3: Verify and commit**

```bash
npm test -- test/unit/actor-bindings.test.ts
git add src/canvas test
git commit -m "feat: bind workflow actors to canvas nodes"
```

---

### Task 6: Define the generic workflow version 2 schema

**Files:**
- Create: `src/workflow/schema.ts`
- Create: `src/workflow/loader.ts`
- Test: `test/unit/workflow-schema.test.ts`

**Interfaces:**
- `WorkflowDefinitionV2`
- `TaskNode`, `ParallelNode`, `JoinNode`, `ForeachNode`, `TerminalNode`
- `parseWorkflowYaml(text)`
- `loadWorkflowFile(path)`
- `saveWorkflowFile(path, workflow)`

- [ ] **Step 1: Write failing schema tests**

Prove the schema accepts arbitrary actor/outcome/node names:

```yaml
actors:
  banana:
    label: Anything
    nodeId: NODE-1
flows:
  main:
    entry: x
    nodes:
      x:
        type: task
        actor: banana
        outcomes:
          purple-elephant: y
      y:
        type: terminal
        status: completed
```

Also verify `version: 1` is rejected by the new implementation unless an explicit migration path is invoked.

- [ ] **Step 2: Implement discriminated node schemas**

Required node shapes:

```ts
type TaskNode = {
  type: "task";
  actor: string;
  prompt?: string;
  outcomes: Record<string, string>;
  policy?: Partial<TaskPolicy>;
};

type ParallelNode = {
  type: "parallel";
  branches: string[];
  join: string;
};

type JoinNode = {
  type: "join";
  next: string;
};

type ForeachNode = {
  type: "foreach";
  source: "children";
  flow: string;
  concurrency: number;
  onComplete: string;
  onChildFailure?: string;
};

type TerminalNode = {
  type: "terminal";
  status: "completed" | "failed" | "paused" | "cancelled";
};
```

- [ ] **Step 3: Add workflow defaults**

Top-level defaults include bounded task timeout, invalid-result retries and max attempts. Defaults are runtime policies, not workflow edges.

- [ ] **Step 4: Implement deterministic YAML save/load**

Saving from the TUI must produce stable key ordering where practical so Git diffs remain readable.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- test/unit/workflow-schema.test.ts
git add src/workflow test
git commit -m "feat: define generic workflow v2 schema"
```

---

### Task 7: Validate arbitrary graphs without imposing domain semantics

**Files:**
- Create: `src/workflow/validator.ts`
- Create: `src/workflow/projection.ts`
- Test: `test/unit/workflow-validator.test.ts`
- Test: `test/unit/workflow-projection.test.ts`

**Interfaces:**

```ts
interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  path?: string;
  message: string;
}

function validateWorkflow(definition, discovery?): ValidationIssue[];
function projectActorHops(definition, flowId): ActorHop[];
```

- [ ] **Step 1: Write failing static graph tests**

Errors:

- missing entry node;
- task references unknown actor;
- outcome target missing;
- parallel branch missing;
- parallel join missing/not a join node;
- foreach flow missing;
- recursive flow-reference cycle in V1;
- no reachable terminal state.

Warnings:

- unreachable node;
- actor keys bound to same node;
- cycle with no reachable terminal path.

Cycles themselves are valid.

- [ ] **Step 2: Implement actor-hop projection**

Collapse virtual nodes when possible to identify logical hops from one `task` actor to the next `task` actor for topology diagnostics. Never use projection to execute the workflow.

- [ ] **Step 3: Implement topology modes**

`strict`: missing projected actor cable => error.

`advisory`: same condition => warning.

`off`: do not evaluate cables.

Cross-flow boundaries (`foreach`) are informational only in V1 and must not produce false strict errors.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- test/unit/workflow-validator.test.ts test/unit/workflow-projection.test.ts
git add src/workflow test
git commit -m "feat: validate generic workflow graphs"
```

---

### Task 8: Build the pure token-based engine for tasks and cycles

**Files:**
- Create: `src/engine/types.ts`
- Create: `src/engine/reducer.ts`
- Test: `test/unit/engine-reducer.test.ts`

**Interfaces:**

```ts
interface ExecutionToken {
  id: string;
  runId: string;
  workItemId: string;
  flowId: string;
  nodeId: string;
  status: "ready" | "dispatched" | "waiting" | "completed" | "cancelled";
  forkStack: ForkContext[];
}

type EngineEvent =
  | { type: "TASK_RESULT"; tokenId: string; outcome: string }
  | { type: "TASK_DISPATCHED"; tokenId: string }
  | { type: "PAUSE_TOKEN"; tokenId: string; reason: string }
  | { type: "RESUME_TOKEN"; tokenId: string };

function reduceEngine(state, event, workflow): EngineMutation[];
```

- [ ] **Step 1: Write failing sequential and cyclic tests**

Test an opaque graph:

```text
x --again--> y --back--> x
x --done--> finish
```

No test variable may use software-specific role assumptions.

- [ ] **Step 2: Implement task outcome transition reducer**

Reject an outcome not declared by the current task. Return typed engine error and leave state unchanged.

- [ ] **Step 3: Implement terminal-state reduction**

Moving into a terminal node updates token/run status but does not claim another queue item; queue draining belongs to the runner.

- [ ] **Step 4: Verify purity**

`engine/` must not import filesystem, SQLite, Wire or TUI modules.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- test/unit/engine-reducer.test.ts
git add src/engine test
git commit -m "feat: add deterministic token workflow engine"
```

---

### Task 9: Add persisted parallel fork/join semantics

**Files:**
- Create: `src/engine/parallel.ts`
- Extend: `src/engine/types.ts`
- Extend: `src/engine/reducer.ts`
- Test: `test/unit/engine-parallel.test.ts`

**Interfaces:**

```ts
interface ForkInstance {
  id: string;
  runId: string;
  flowId: string;
  parallelNodeId: string;
  joinNodeId: string;
  branchIds: string[];
```
