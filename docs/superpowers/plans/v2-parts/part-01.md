### Task 7: Define the generic workflow version 2 schema

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

### Task 8: Validate arbitrary graphs without imposing domain semantics

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

### Task 9: Build the pure token-based engine for tasks and cycles

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

### Task 10: Add persisted parallel fork/join semantics

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

### Task 11: Add hierarchical work items and foreach subflows

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

### Task 12: Persist workflows, queue, runs, tokens, forks and attempts in SQLite

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
run_actor_bindings
tokens
fork_instances
attempts
results
events
```

Include foreign keys and useful indexes for pending top-level work, active runs and tokens by run.

- [ ] **Step 2: Implement schema**

Persist workflow source/hash with each run so a running instance does not silently switch behavior when the YAML file is edited. Snapshot the confirmed actor-key -> canvas `nodeId` bindings into `run_actor_bindings` at run start. New work can use a new workflow/binding revision; resumed work uses its recorded revision unless the user explicitly pauses, revalidates/rebinds, and resumes.

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
