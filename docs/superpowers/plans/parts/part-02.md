  status: "open" | "joined";
}
```

- [ ] **Step 1: Write failing fork test**

Entering a `parallel` node with three branches emits:

- one fork instance;
- three branch tokens with distinct `branchId`s;
- parent token consumed.

- [ ] **Step 2: Write failing join test**

When two of three branches reach the join, no continuation token exists. When the third arrives, exactly one continuation token is emitted and fork status becomes `joined`.

Repeated delivery/recovery of the third arrival must not create another continuation.

- [ ] **Step 3: Implement fork stack context**

Persist enough context on branch tokens to associate join arrivals with the correct fork instance. Reject unsupported malformed nested-join states explicitly rather than guessing.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- test/unit/engine-parallel.test.ts
git add src/engine test
git commit -m "feat: add deterministic parallel joins"
```

---

### Task 10: Add hierarchical work items and foreach subflows

**Files:**
- Create: `src/engine/foreach.ts`
- Extend: `src/engine/reducer.ts`
- Create: `src/queue/service.ts`
- Test: `test/unit/engine-foreach.test.ts`
- Test: `test/unit/queue.test.ts`

**Interfaces:**

```ts
interface WorkItem {
  id: string;
  parentId?: string;
  title: string;
  body: string;
  status: WorkItemStatus;
  metadata: Record<string, unknown>;
}

interface ChildRunRequest {
  parentTokenId: string;
  workItemId: string;
  flowId: string;
}
```

- [ ] **Step 1: Write failing queue hierarchy tests**

Verify parent/child creation, children are not claimed as top-level queue work, and top-level FIFO ordering is deterministic.

- [ ] **Step 2: Write failing foreach tests**

Given three child work items and `concurrency: 1`, `foreach` emits one child run request at a time and only transitions to `onComplete` after all three child runs finish `completed`.

Given `concurrency: 2`, at most two child runs are runnable simultaneously.

- [ ] **Step 3: Implement child failure behavior**

If a child subflow ends non-completed:

- route to `onChildFailure` when configured;
- otherwise pause the parent foreach token.

Do not invent a retry edge.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- test/unit/engine-foreach.test.ts test/unit/queue.test.ts
git add src/engine src/queue test
git commit -m "feat: add hierarchical foreach subflows"
```

---

### Task 11: Persist workflows, queue, runs, tokens, forks and attempts in SQLite

**Files:**
- Create: `src/persistence/db.ts`
- Create: `src/persistence/migrations.ts`
- Create: `src/persistence/repositories.ts`
- Test: `test/unit/persistence.test.ts`

**Interfaces:**
- `DatabaseContext.transaction(fn)`
- `WorkItemRepository`
- `RunRepository`
- `TokenRepository`
- `ForkRepository`
- `AttemptRepository`
- `EventRepository`

- [ ] **Step 1: Write failing migration tests**

Expected V1 tables:

```text
workflows
work_items
runs
tokens
fork_instances
attempts
results
events
```

Include foreign keys and useful indexes for pending top-level work, active runs and tokens by run.

- [ ] **Step 2: Implement schema**

Persist workflow source/hash with each run so a running instance does not silently switch behavior when the YAML file is edited. New work can use the new workflow revision; resumed work uses its recorded revision unless the user explicitly migrates it.

- [ ] **Step 3: Implement atomic engine mutation persistence**

Repository API must support transactionally writing result + token transition + fork/join changes before the scheduler can dispatch another task.

- [ ] **Step 4: Write crash/reopen test**

Close DB after persisting a token at arbitrary node `x`, reopen, assert exact token/fork/work item state is restored.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- test/unit/persistence.test.ts
git add src/persistence test
git commit -m "feat: persist durable workflow execution"
```

---

### Task 12: Implement the explicit result protocol and engine-owned prompts

**Files:**
- Create: `src/workflow/result-protocol.ts`
- Create: `src/runner/prompt.ts`
- Test: `test/unit/result-protocol.test.ts`

**Interfaces:**

```ts
interface FlowResult {
  outcome: string;
  summary?: string;
  data?: unknown;
}

function extractFlowResult(text: string): FlowResult | null;
function buildManagedPrompt(input): string;
```

- [ ] **Step 1: Write failing parser tests**

Accept the final valid marker:

```text
[[MAESTRI_FLOW_RESULT]] {"outcome":"purple-elephant","summary":"ok"}
```

Reject malformed JSON and validate outcome later against the current node.

- [ ] **Step 2: Implement bounded marker extraction**

If multiple markers exist, use the last syntactically valid marker and record a warning event.

- [ ] **Step 3: Implement managed prompt injection**

The appended contract lists only the configured outcomes for that task and says explicitly:

```text
Do not choose or contact the next workflow actor. The runtime owns continuation.
```

Do not rewrite the user's agent role prompt.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- test/unit/result-protocol.test.ts
git add src/workflow src/runner test
git commit -m "feat: enforce structured workflow outcomes"
```

---

### Task 13: Implement dispatch, actor resolution and recovery policy

**Files:**
- Create: `src/runner/dispatch.ts`
- Create: `src/runner/recovery.ts`
- Test: `test/unit/recovery.test.ts`
- Extend: `test/support/fake-wire-transport.ts`

**Interfaces:**

```ts
interface DispatchService {
  executeTask(input: DispatchInput): Promise<DispatchResult>;
}
```

- [ ] **Step 1: Write failing stale-binding test**

If actor binding node id no longer exists in live discovery, return `PAUSE_STALE_BINDING`; never search by name.

- [ ] **Step 2: Write failing invalid-result retry test**

First invalid completion sends only a short correction prompt. After configured invalid-result attempts, pause the token without advancing.

- [ ] **Step 3: Write failing transport recovery tests**

Cover:

- temporary disconnect => reconnect/backoff;
- changed epoch => fetch fresh snapshot before resolution;
- `401` => `REPAIR_PAIRING_REQUIRED`;
- terminal `409 not running` => optionally restart only when policy allows, otherwise pause;
- pending Y/n prompt => pause for human action.

- [ ] **Step 4: Implement dispatch lifecycle**

Immediately before every task dispatch:

1. obtain fresh/current snapshot;
2. resolve actor `nodeId`;
3. get current `TerminalCard.id`;
4. check running state;
5. persist attempt start;
6. open/capture terminal stream;
7. send managed prompt;
8. wait for valid result or recovery event.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- test/unit/recovery.test.ts test/unit/actor-bindings.test.ts
git add src/runner test
git commit -m "feat: dispatch workflow tasks through live canvas bindings"
```

---

### Task 14: Build the scheduler and durable queue-draining runner

**Files:**
- Create: `src/runner/scheduler.ts`
- Create: `src/runner/runner.ts`
- Test: `test/integration/runner-cycle.test.ts`
- Test: `test/integration/runner-parallel.test.ts`
- Test: `test/integration/runner-foreach.test.ts`
- Test: `test/integration/queue-drain.test.ts`

**Interfaces:**

```ts
class WorkflowRunner {
  runQueue(workflowId: string): Promise<void>;
  runWorkItem(workflowId: string, workItemId: string): Promise<string>;
  resume(runId: string): Promise<void>;
}
```

- [ ] **Step 1: Write cycle integration test**

Fake two terminals and an opaque workflow:

```text
A outcome retry -> B
B outcome back -> A
A outcome finish -> terminal
```

Verify exact dispatch order and that no actor determines the next actor.

- [ ] **Step 2: Implement ready-token scheduler**

The scheduler repeatedly:

1. loads persisted runnable tokens;
2. advances virtual nodes (`parallel`, ready `join`, `foreach`, `terminal`) through engine mutations;
3. dispatches ready `task` nodes;
4. persists results/mutations atomically;
5. stops only when run is terminal/paused/cancelled or no safe progress exists.

- [ ] **Step 3: Add parallel integration test**

Run two fake task branches concurrently, have one finish first, assert continuation is not dispatched until both branches arrive at the join.

- [ ] **Step 4: Add foreach integration test**

Run child items through a child flow, then assert the parent continuation is dispatched once all required child runs complete.

- [ ] **Step 5: Add top-level queue draining**

Three parentless work items must execute in queue order. Child items are never accidentally claimed by the outer loop.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- test/integration/runner-cycle.test.ts test/integration/runner-parallel.test.ts test/integration/runner-foreach.test.ts test/integration/queue-drain.test.ts
git add src/runner test
git commit -m "feat: execute durable workflow queues"
```

---

### Task 15: Build the pure TUI configuration state model

**Files:**
- Create: `src/tui/state.ts`
- Test: `test/unit/tui-state.test.ts`

**Interfaces:**

```ts
interface ConfigureState {
  screen: ConfigureScreen;
  discovery?: CanvasDiscovery;
  actorBindings: Record<string, ActorBinding>;
  draftWorkflow: WorkflowDefinitionV2;
  validation: ValidationIssue[];
}

function reduceConfigureState(state, action): ConfigureState;
```

- [ ] **Step 1: Write failing state tests**

Cover:

- selecting workspace/floor discovery;
- adding arbitrary actor key `banana` bound to node `NODE-X`;
- renaming actor label without changing binding;
- adding task node with arbitrary outcomes;
- adding/removing transitions;
- adding parallel/join;
