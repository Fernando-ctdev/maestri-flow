### Task 13: Implement the explicit result protocol and engine-owned prompts

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

### Task 14: Implement dispatch, actor resolution and recovery policy

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

### Task 15: Build the scheduler and durable queue-draining runner

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

### Task 16: Build the pure TUI configuration state model

**Files:**
- Create: `src/tui/state.ts`
- Test: `test/unit/tui-state.test.ts`

**Interfaces:**

```ts
interface ConfigureState {
  screen: ConfigureScreen;
  discovery?: CanvasDiscovery;
  provisioner?: ProvisionerBinding;
  provisioningBrief?: string;
  stagedProvisioningProposal?: ProvisioningProposal;
  actorBindings: Record<string, ActorBinding>;
  draftWorkflow: WorkflowDefinitionV2;
  validation: ValidationIssue[];
}

function reduceConfigureState(state, action): ConfigureState;
```

- [ ] **Step 1: Write failing state tests**

Cover:

- selecting workspace/floor discovery;
- selecting/clearing an `isManager` provisioner by `nodeId`;
- staging then accepting/rejecting a provisioning work-item proposal without auto-binding terminals;
- refreshing discovery after direct Maestro interaction;
- adding arbitrary actor key `banana` bound to node `NODE-X`;
- renaming actor label without changing binding;
- adding task node with arbitrary outcomes;
- adding/removing transitions;
- adding parallel/join;
- adding foreach/subflow;
- stale binding warning after canvas refresh.

- [ ] **Step 2: Implement pure reducer**

The reducer must be independent of Ink rendering so configuration behavior can be tested without terminal snapshots.

- [ ] **Step 3: Verify and commit**

```bash
npm test -- test/unit/tui-state.test.ts
git add src/tui/state.ts test
git commit -m "feat: model interactive workflow configuration"
```

---

### Task 17: Build the interactive TUI from the live Maestri canvas

**Files:**
- Create: `src/tui/app.tsx`
- Create: `src/tui/screens/ConnectScreen.tsx`
- Create: `src/tui/screens/ProvisioningScreen.tsx`
- Create: `src/tui/screens/CanvasScreen.tsx`
- Create: `src/tui/screens/ActorBindingsScreen.tsx`
- Create: `src/tui/screens/WorkflowBuilderScreen.tsx`
- Create: `src/tui/screens/ReviewScreen.tsx`
- Create: `src/tui/screens/RebindScreen.tsx`
- Create: `src/tui/screens/EnqueueScreen.tsx`
- Create: `src/tui/components/TerminalList.tsx`
- Create: `src/tui/components/ActorEditor.tsx`
- Create: `src/tui/components/NodeEditor.tsx`
- Create: `src/tui/components/TransitionEditor.tsx`
- Create: `src/tui/components/ValidationPanel.tsx`
- Test: `test/integration/configure-flow.test.tsx`

**Interfaces:**
- `runConfigureTui(deps): Promise<WorkflowDefinitionV2>`
- `runRebindTui(deps, workflow): Promise<WorkflowDefinitionV2>`
- `runEnqueueTui(deps): Promise<WorkItemInput>`

- [ ] **Step 1: Write a failing end-to-end TUI test**

Using Ink Testing Library and fake live canvas:

1. choose workspace/floor;
2. select an `isManager` terminal as provisioner and send a natural-language brief;
3. fake Maestro provisions two terminals; Flow refreshes the feed and shows the resulting canvas delta;
4. review/confirm staged work items;
5. select the two newly discovered terminals;
6. assign actor keys `alpha` and `omega`;
7. create two task nodes plus terminal node;
8. create a cycle `step-a -> step-b -> step-a` plus completion outcome;
9. save;
10. parse saved YAML and assert nodeIds/outcomes exactly match user choices.

Add a second test that skips Maestro entirely and configures from an existing canvas.

- [ ] **Step 2: Implement provisioning choice/screen**

Show only live `isManager` terminals as provisioning candidates. Support:

- use existing canvas;
- send a brief through selected Maestro;
- "I will talk to Maestro directly" + Refresh.

After integrated provisioning, show the authoritative refreshed canvas delta and staged work items. Require explicit acceptance before queue import. Never auto-bind newly created terminals and never accept routing information from the provisioning payload.

- [ ] **Step 3: Implement canvas terminal picker**

Display `name`, optional `roleName`, `agentType`, `isManager`, running state and connected terminal names. These are hints only.

- [ ] **Step 4: Implement arbitrary actor editor**

Never pre-create software-specific role names. Suggested actor key may derive from terminal name/role but user must be able to replace it completely.

- [ ] **Step 5: Implement workflow node editor**

Support all V1 node types and target selection from existing node ids. Make cycles possible without warnings that imply they are inherently wrong.

- [ ] **Step 6: Implement live validation/review screen**

Show errors/warnings before save. Strict topology errors block save; advisory issues do not.

- [ ] **Step 7: Implement rebind flow**

Show stale actor and current canvas terminals; replacing binding changes only the actor `nodeId`/snapshot, not workflow nodes/transitions.

- [ ] **Step 8: Verify and commit**

```bash
npm test -- test/integration/configure-flow.test.tsx
npm run typecheck
git add src/tui test
git commit -m "feat: add canvas-driven workflow TUI"
```

---
