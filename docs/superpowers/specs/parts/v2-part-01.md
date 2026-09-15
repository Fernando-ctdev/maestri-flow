## 9. Provisioning handoff and execution ownership

Provisioning and managed execution are separate lifecycle phases:

```text
DRAFT
  -> PROVISIONING (optional Maestro)
  -> REVIEW
  -> READY
  -> RUNNING
  -> COMPLETED / PAUSED / CANCELLED
```

A managed run may start only after the user confirms the current actor bindings and workflow revision. At run start, Flow records the workflow revision and bound canvas `nodeId` values.

During `RUNNING`:

- Maestro is not allowed to choose, skip or redirect workflow transitions;
- unrelated canvas changes are tolerated;
- removal/replacement of a bound actor pauses affected tokens and requires explicit rebind;
- a user may pause the run, invoke Maestro provisioning again, refresh the canvas, rebind actors, validate and resume;
- a future policy may allow runtime-requested provisioning, but V1 requires an explicit pause/confirm boundary before newly provisioned terminals join an active workflow.

This is the determinism boundary: provisioning can be creative and dynamic, while execution remains graph-controlled.

### 9.1 Optional provisioning result protocol

When provisioning is initiated through Flow rather than directly in the Maestro terminal, Flow appends an engine-owned result contract such as:

```text
[[MAESTRI_FLOW_PROVISIONING_RESULT]]
{"summary":"...","workItems":[{"key":"item-1","title":"...","body":"...","parentKey":null}]}
```

The runtime validates only the envelope shape. It does not accept actor ids, transitions or routing decisions from this payload. `workItems` are staged, displayed to the user and imported only after confirmation.

## 10. Agent result protocol

The runtime does not infer transition outcomes from prose.

Every task dispatch appends an engine-owned contract containing only the outcomes configured for that node.

Example:

```text
When your work is complete, end with exactly one machine-readable result:

[[MAESTRI_FLOW_RESULT]] {"outcome":"accepted","summary":"..."}

Allowed outcomes for this step: accepted, rejected
Do not delegate or choose the next workflow step. The runtime controls continuation.
```

The response envelope is:

```ts
interface FlowResult {
  outcome: string;
  summary?: string;
  data?: unknown;
}
```

The runtime validates `outcome` against the current task node. An undeclared outcome never advances state.

If a terminal becomes inactive/needs attention without a valid result marker, the current graph token remains at the same node and recovery policy applies.

## 11. Execution engine

The engine is a persisted token-based graph executor.

A run has one or more execution tokens. A simple sequential workflow has one token. `parallel` creates multiple branch tokens. `join` consumes the matching branch tokens and emits one continuation token.

Core invariants:

1. A token is always at exactly one node or terminal state.
2. A `task` token cannot move until a valid declared outcome exists.
3. A transition can only target a node in the same configured flow.
4. Cycles are legal.
5. Every state mutation is persisted before the next dispatch.
6. Parallel tokens are identified by persisted fork instance ids.
7. Join completion occurs exactly once for each fork instance.
8. `foreach` child runs are durable and resumable.
9. The runtime never fabricates an edge to make progress.

## 12. Canvas binding resolution

At configure time the user binds actors to canvas `nodeId` values.

At execution time:

```text
actor key
  -> configured nodeId
  -> current FeedSnapshot.canvas.nodes[nodeId]
  -> terminal payload
  -> current TerminalCard.id
  -> POST /api/terminals/{id}/prompt
```

If the node still exists but terminal metadata changed, execution continues.

If the node disappeared or is no longer a terminal:

- the run pauses;
- the TUI marks the actor binding stale;
- the user can rebind that actor to another live terminal;
- active workflow state is preserved.

No workflow file needs to be rewritten by hand.

## 13. Canvas connections and workflow edges

Canvas cables and workflow transitions are deliberately different concepts.

A canvas connection says two canvas objects are connected in Maestri. A workflow edge says execution may move from one workflow node to another under a configured condition.

The configuration UI can use canvas connections to:

- show relevant neighboring terminals;
- suggest likely workflow targets;
- warn when a configured hop has no corresponding cable;
- enforce cable presence in `strict` topology mode.

It must never infer role, direction or outcome from the cable itself.

## 14. Work queue and hierarchy

The SQLite store contains durable work items:

```text
id
parent_id nullable
title
body
status
metadata JSON
created_at
updated_at
```

Statuses:

```text
pending -> running -> completed | failed | paused | cancelled
```

A work item may have children. The engine itself does not care whether the relationship means feature/task, document/section, campaign/asset, or something else.

`foreach source: children` is the generic mechanism for processing that hierarchy before advancing the parent token.

When a top-level work item completes, the runner may claim the next pending top-level item and repeat until the queue is empty.

### 14.1 Visual board projection to Maestri Notes

`maestri-flow` may create and maintain two Maestri Notes through Wire as an optional visual projection of the durable state:

1. **Workflow Board** — a compact Markdown board that shows work-item ids/titles under workflow-stage columns.
2. **Task Details** — a separate Markdown note with the full description and current execution summary for each work item.

These Notes are **never** a source of truth. SQLite remains authoritative for queue state, active tokens, transitions, retries and completion. The projection is one-way:

```text
SQLite transaction commits
        ↓
Board projector reads committed state
        ↓
Wire updates Workflow Board + Task Details Notes
```

A Note sync failure must not roll back or block a valid workflow transition. The projector records the sync failure and retries later from SQLite. On restart it can regenerate both Notes entirely from persisted state.

The board is derived from the configured workflow, not from hard-coded software roles. `Backlog` and `Done` are synthetic columns; workflow-stage columns come from user-visible task-node labels/order in the saved workflow visualization config. The user may rename, hide or reorder visual columns without changing execution semantics.

Example visual projection:

```text
| Backlog | Requisitos | Especificação | Planejamento | Desenvolvimento | Done |
|---|---|---|---|---|---|
| TASK-4 |  | TASK-3 |  |  | TASK-1 |
| TASK-5 |  |  |  |  | TASK-2 |
| TASK-6 |  |  |  |  |  |
```

For simple sequential/cyclic workflows, a running item appears in the column corresponding to its current task node. For parallel execution, the same work item may appear in more than one active stage column because SQLite may contain multiple active graph tokens for that item. Regressions naturally move the projection back to the configured stage after the underlying SQLite transition commits.

The detailed Note contains stable work-item identity plus human-readable detail, for example:

```text
## TASK-3 — Validate checkout flow
Status: running
Current stages: Especificação

Full description...
```

The workflow profile stores the created Note node ids so subsequent syncs update the same canvas Notes rather than creating duplicates. The TUI/CLI may offer `Create/repair visual board`, but execution correctness must not depend on either Note existing.

## 15. Persistence

SQLite is the source of truth for execution state.

Minimum persisted entities:

- paired host metadata (token stored separately with restricted permissions where practical);
- workflow registrations;
- work items and hierarchy;
- runs;
- graph tokens;
- task attempts;
- fork/join instances;
- child/subflow runs;
- results;
- append-only events.

On process restart the runner reconstructs state from SQLite plus a fresh Wire snapshot. It never asks an LLM to remember what happened.

## 16. Recovery and retries

Retries are bounded and configured per workflow defaults or per task node.

System failure classes are distinct from user-defined task outcomes:

- invalid result envelope;
- terminal not running;
- terminal timeout;
- Wire disconnect;
- stale actor binding;
- pending interactive prompt;
- unauthorized/revoked pairing;
- incompatible Wire protocol/capabilities.

Safe defaults:

- invalid result: correction prompt, then pause after configured attempts;
- Wire disconnect: reconnect with backoff, preserving state;
- `401`: stop and require re-pair;
- stale binding: pause and require rebind;
- pending Y/n prompt: pause for human action;
- timeout: retry current task only when policy permits, otherwise pause.

Retries never change the workflow edge by themselves.
