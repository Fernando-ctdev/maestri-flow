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

### Task 16: Build the interactive TUI from the live Maestri canvas

**Files:**
- Create: `src/tui/app.tsx`
- Create: `src/tui/screens/ConnectScreen.tsx`
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
2. select two arbitrary terminals;
3. assign actor keys `alpha` and `omega`;
4. create two task nodes plus terminal node;
5. create a cycle `step-a -> step-b -> step-a` plus completion outcome;
6. save;
7. parse saved YAML and assert nodeIds/outcomes exactly match user choices.

- [ ] **Step 2: Implement canvas terminal picker**

Display `name`, optional `roleName`, `agentType`, running state and connected terminal names. These are hints only.

- [ ] **Step 3: Implement arbitrary actor editor**

Never pre-create software-specific role names. Suggested actor key may derive from terminal name/role but user must be able to replace it completely.

- [ ] **Step 4: Implement workflow node editor**

Support all V1 node types and target selection from existing node ids. Make cycles possible without warnings that imply they are inherently wrong.

- [ ] **Step 5: Implement live validation/review screen**

Show errors/warnings before save. Strict topology errors block save; advisory issues do not.

- [ ] **Step 6: Implement rebind flow**

Show stale actor and current canvas terminals; replacing binding changes only the actor `nodeId`/snapshot, not workflow nodes/transitions.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- test/integration/configure-flow.test.tsx
npm run typecheck
git add src/tui test
git commit -m "feat: add canvas-driven workflow TUI"
```

---

### Task 17: Wire CLI commands to the TUI, queue and runner

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/cli/output.ts`
- Create: `src/config/profiles.ts`
- Test: `test/integration/cli.test.ts`

**Interfaces:**

```text
maestri-flow pair
maestri-flow configure
maestri-flow inspect-canvas
maestri-flow validate [workflow]
maestri-flow enqueue [workflow]
maestri-flow run [workflow]
maestri-flow status
maestri-flow pause <run>
maestri-flow resume <run>
maestri-flow cancel <run>
maestri-flow rebind [workflow]
```

- [ ] **Step 1: Implement `pair`**

Support six-digit code and manual password paths. Store device name `maestri-flow` by default and print the returned role. Refuse execution if role is not owner/Full control.

- [ ] **Step 2: Implement `inspect-canvas`**

Print live terminals and connections in human-readable form and `--json` form. This command must make debugging bindings possible without opening YAML.

- [ ] **Step 3: Implement `configure` / `rebind` / `validate`**

`configure` launches the TUI and saves the profile/workflow. `rebind` launches directly at stale/current bindings. `validate` can run non-interactively in CI.

- [ ] **Step 4: Implement queue commands**

`enqueue` supports interactive parent/child creation plus flags:

```text
--title
--body
--parent <id>
--metadata <json>
```

- [ ] **Step 5: Implement runtime commands**

`run` drains top-level queue; `status` shows current work item, tokens and paused reasons; pause/resume/cancel are durable DB mutations respected by scheduler.

- [ ] **Step 6: Verify and commit**

```bash
npm test -- test/integration/cli.test.ts
npm run typecheck
npm run build
git add src test
git commit -m "feat: expose maestri flow cli"
```

---

### Task 18: Prove crash recovery and actor rebinding

**Files:**
- Create: `test/integration/runner-resume.test.ts`
- Create: `test/integration/runner-rebind.test.ts`

- [ ] **Step 1: Write mid-task restart test**

Persist a run with a dispatched/unfinished attempt, terminate the runner instance, recreate runner with same DB and fresh Wire snapshot, and assert recovery policy does not duplicate a completed result or skip the node.

- [ ] **Step 2: Write post-result/pre-dispatch restart test**

Persist the transition atomically, simulate process death before next prompt, restart, assert only the new current node is dispatched once.

- [ ] **Step 3: Write stale actor rebind test**

1. workflow actor bound to `NODE-OLD`;
2. remove it from feed;
3. runner pauses;
4. rebind same actor key to `NODE-NEW`;
5. resume;
6. current workflow token continues unchanged and prompt goes to current terminal id for `NODE-NEW`.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- test/integration/runner-resume.test.ts test/integration/runner-rebind.test.ts
git add test
git commit -m "test: prove workflow recovery and rebinding"
```

---

### Task 19: Add canonical examples that prove the engine is not software-specific

**Files:**
- Create: `examples/cyclic-review.yaml`
- Create: `examples/parallel-checks.yaml`
- Create: `examples/parent-child.yaml`
- Create: `examples/editorial-pipeline.yaml`
- Test: `test/unit/examples.test.ts`

- [ ] **Step 1: Create four schema-valid examples**

`cyclic-review.yaml` may use development-flavored labels as one demonstration.

`editorial-pipeline.yaml` must use non-software roles such as research/write/edit/publish to prove the schema and engine are domain-neutral.

`parallel-checks.yaml` demonstrates a fork/join.

`parent-child.yaml` demonstrates foreach child subflow followed by a whole-parent task.

- [ ] **Step 2: Test every example through the same parser/validator**

No example receives special code paths.

- [ ] **Step 3: Commit**

```bash
git add examples test
git commit -m "docs: add generic workflow examples"
```

---

### Task 20: Document setup, safety and operating model

**Files:**
- Create: `README.md`

- [ ] **Step 1: Document installation**

Include Node requirement, build/install commands and Windows/macOS notes.

- [ ] **Step 2: Document Wire pairing from official behavior**

Explain:

```text
Maestri -> Settings -> Wire -> enable
pair maestri-flow
Full control required for prompt dispatch
SPKI pin is stored
401 means pair again
```

Do not claim Wire is stable; call out beta/protocol checks.

- [ ] **Step 3: Document the mental model**

Use exactly this separation:

```text
Canvas = what exists
TUI = what each terminal means + workflow authored by user
Workflow = legal transitions
Runtime = deterministic executor
Wire = transport/observation
LLMs = workers
```

- [ ] **Step 4: Document managed-run behavior**

State clearly that normal canvas agent-to-agent connections and Maestro Mode are not the workflow authority. A Maestro terminal can be a bound worker, but continuation belongs to the runtime.

- [ ] **Step 5: Document running inside Maestri**

Recommend a Shell terminal on the canvas for visibility while clarifying that execution also works outside Maestri.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document maestri flow usage"
```

---

### Task 21: Final verification gate

**Files:**
- Modify only files needed to fix discovered verification failures.

- [ ] **Step 1: Run all static/build checks**

```bash
npm run typecheck
npm run build
```

Expected: exit code 0.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run architecture guard checks**

Search source for accidental domain hard-coding:

```bash
rg -n "developer|reviewer|architect|\bqa\b" src/engine src/canvas src/workflow
```

Expected: no engine logic depending on those concepts. Documentation/example strings are allowed outside core engine logic.

Search for name-based actor resolution:

```bash
rg -n "find\(.*name|terminalName.*==|roleName.*==" src/canvas src/runner
```

Expected: no fallback that silently resolves actors by display name.

- [ ] **Step 4: Run acceptance scenarios**

With fake Wire fixtures verify all spec acceptance criteria:

1. canvas terminals discovered;
2. arbitrary actor bindings saved by nodeId;
3. arbitrary cycle executes;
4. undeclared outcome cannot advance;
5. parallel branches join once;
6. child subflows aggregate before parent continuation;
7. stale node pauses and rebind resumes;
8. restart resumes durable state;
9. top-level queue drains to empty.

- [ ] **Step 5: Commit final fixes only if needed**

```bash
git add .
git commit -m "chore: finalize maestri flow verification"
```

---

## Implementation Order / Review Gates

Execute Tasks 1-21 in order. The meaningful review gates are:

1. **After Task 7:** schema + bindings + generic graph are correct before engine work.
2. **After Task 10:** token engine can express cycles, parallel joins and child subflows without Maestri/Wire dependencies.
3. **After Task 14:** runtime execution works headlessly against fake Wire.
4. **After Task 16:** user can author the same model interactively from a real/fake canvas.
5. **After Task 18:** recovery/rebind invariants are proven.
6. **After Task 21:** only then call the project complete.

Do not add product features between these gates unless they are required by the design spec. In particular, do not add automatic semantic role inference, LLM-based routing, visual canvas editing, external task-provider integrations, or cross-floor orchestration in V1.