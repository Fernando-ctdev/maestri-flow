### Task 19: Wire CLI commands to the TUI, queue and runner

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/cli/output.ts`
- Create: `src/config/profiles.ts`
- Test: `test/integration/cli.test.ts`

**Interfaces:**

```text
maestri-flow pair
maestri-flow provision
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
maestri-flow board create [workflow]
maestri-flow board sync [workflow]
maestri-flow board repair [workflow]
```

- [ ] **Step 1: Implement `pair`**

Support six-digit code and manual password paths. Store device name `maestri-flow` by default and print the returned role. Refuse execution if role is not owner/Full control.

- [ ] **Step 2: Implement `inspect-canvas`**

Print live terminals and connections in human-readable form and `--json` form. This command must make debugging bindings possible without opening YAML.

- [ ] **Step 3: Implement `provision` / `configure` / `rebind` / `validate`**

`provision` launches the provisioning screen directly (or accepts a brief flag) and stages the refreshed canvas/work-item proposal. `configure` launches the full TUI and saves the profile/workflow. `rebind` launches directly at stale/current bindings. `validate` can run non-interactively in CI.

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

- [ ] **Step 6: Implement board commands**

`board create` creates the two projection Notes and persists their node ids; `board sync` forces a refresh from current committed SQLite state; `board repair` recreates missing Notes and regenerates all Markdown from SQLite without changing any workflow state.

- [ ] **Step 7: Verify and commit**

```bash
npm test -- test/integration/cli.test.ts
npm run typecheck
npm run build
git add src test
git commit -m "feat: expose maestri flow cli"
```

---

### Task 20: Prove crash recovery and actor rebinding

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

- [ ] **Step 4: Write pause -> re-provision -> rebind -> resume test**

1. start a run with confirmed bindings;
2. pause the run;
3. invoke the provisioning service against a fake Maestro that changes the team;
4. refresh the authoritative feed;
5. explicitly rebind the affected actor;
6. revalidate without changing the current graph token;
7. resume and assert the next dispatch follows the existing workflow transition, not any Maestro suggestion.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- test/integration/runner-resume.test.ts test/integration/runner-rebind.test.ts test/integration/maestro-provisioning.test.ts
git add test
git commit -m "test: prove workflow recovery and rebinding"
```

---

### Task 21: Add canonical examples that prove the engine is not software-specific

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

### Task 22: Document setup, safety and operating model

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
Human = intent + approval
Maestro = optional natural-language provisioning plane
Canvas = what actually exists
TUI = provisioning handoff + actor meaning + workflow authored by user
Workflow = legal transitions
Runtime = deterministic executor
SQLite = execution source of truth
Board/Task Notes = optional visual projection only
Wire = transport/observation
Worker LLMs = task execution
```

- [ ] **Step 4: Document managed-run behavior**

State clearly that Maestro Mode is intentionally preserved for recruiting, roles, connections, context organization and work decomposition, but is not the workflow authority. Document the handoff boundary: provision -> refresh/review -> confirm bindings/workflow -> managed run. During a run, continuation belongs only to the runtime.

- [ ] **Step 5: Document running inside Maestri**

Recommend a Shell terminal on the canvas for visibility while clarifying that execution also works outside Maestri.

- [ ] **Step 6: Document visual board projection**

Explain that Flow may create `Workflow Board` and `Task Details` Notes from the saved workflow + SQLite state. Make explicit that Notes are disposable/rebuildable views: deleting or failing to update them cannot change, regress or complete a workflow.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: document maestri flow usage"
```

---

### Task 23: Final verification gate

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

Search for forbidden Maestro-to-engine coupling:

```bash
rg -n "provision|Maestro|isManager" src/engine
```

Expected: no provisioning/manager semantics in the pure engine.

- [ ] **Step 4: Run acceptance scenarios**

With fake Wire fixtures verify all spec acceptance criteria:

1. `isManager` Maestro is discoverable and can provision a team through a natural-language brief;
2. Flow refreshes the authoritative canvas and does not trust terminal ids/names from LLM output;
3. proposed work items are staged until confirmation;
4. canvas terminals discovered;
5. arbitrary actor bindings saved by nodeId;
6. arbitrary cycle executes;
7. undeclared outcome cannot advance;
8. parallel branches join once;
9. child subflows aggregate before parent continuation;
10. stale node pauses and rebind resumes;
11. restart resumes durable state;
12. top-level queue drains to empty;
13. pausing a run, provisioning/rebinding, and resuming preserves graph state;
14. Maestro never chooses a managed-run transition;
15. board/task-detail Notes follow backlog, active stages, regression and done from SQLite;
16. a Note sync failure does not roll back or block a committed transition, and repair recreates the Notes from SQLite.

- [ ] **Step 5: Commit final fixes only if needed**

```bash
git add .
git commit -m "chore: finalize maestri flow verification"
```

---

## Implementation Order / Review Gates

Execute Tasks 1-23 in order. The meaningful review gates are:

1. **After Task 5:** Maestro provisioning is cleanly separated from workflow execution and only the refreshed canvas is trusted.
2. **After Task 8:** schema + bindings + generic graph are correct before engine work.
3. **After Task 11:** token engine can express cycles, parallel joins and child subflows without Maestri/Wire dependencies.
4. **After Task 15:** runtime execution works headlessly against fake Wire.
5. **After Task 16:** visual Notes are proven to be one-way, rebuildable projections of SQLite state.
6. **After Task 18:** user can author the same model interactively from a real/fake canvas.
7. **After Task 20:** recovery/rebind invariants are proven.
8. **After Task 23:** only then call the project complete.

Do not add product features between these gates unless they are required by the design spec. In particular, do not add automatic semantic role inference, LLM-based routing, autonomous mid-run Maestro control, external task-provider integrations, or cross-floor orchestration in V1. Maestro-assisted provisioning before a run (or after an explicit pause) is part of V1 and must remain separate from engine routing.
