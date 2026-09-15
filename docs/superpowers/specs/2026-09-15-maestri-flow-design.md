# Maestri Flow — Design

Date: 2026-09-15
Status: Approved architecture — supersedes the previous software-specific draft

## 1. Goal

Build a deterministic, user-configurable workflow engine on top of **Maestri Wire**.

Maestri remains the visual surface where terminals, agents, roles, notes and connections live. `maestri-flow` reads that live canvas, lets the user decide which canvas terminals participate and what logical role each one has, lets the user create an arbitrary workflow in an interactive TUI, then executes that workflow with deterministic state, retries, loops, parallel branches, joins and durable work queues.

The runtime must **not** infer that a terminal is a developer, reviewer, architect, QA agent, researcher, writer, analyst, or anything else. Those are user-defined meanings.

The core rule is:

> **Canvas defines what exists. The user defines what it means and how it flows. The runtime only enforces the configured workflow.**

## 2. Problem being solved

Maestro Mode is useful for free-form orchestration, but the control plane is still an LLM. In long or cyclic workflows the model must simultaneously remember the task, its role instructions, skills, prior outputs, who should run next, when to regress, when to retry and when the whole queue is done.

That makes the workflow probabilistic.

`maestri-flow` moves only the **control plane** into deterministic code:

```text
Maestro-style orchestration
LLM -> decides next agent -> remembers loop -> retries -> decides completion

Maestri Flow
runtime -> dispatches configured node -> validates outcome -> applies declared edge -> persists state
```

LLMs remain probabilistic inside work steps. Routing and continuation are deterministic.

## 3. Non-goals

The engine is not:

- a replacement for Maestri's canvas;
- a new AI agent;
- a hard-coded software development pipeline;
- a system that guesses roles from terminal names;
- a system that infers workflow semantics from canvas geometry;
- a replacement for the user's existing agent prompts/skills;
- a requirement that agents communicate directly with one another.

Maestro Mode is not required for managed runs. A Maestro terminal may participate as a normal actor if the user binds it to a workflow role, but its Maestro orchestration capability is not the workflow authority.

## 4. Official Maestri Wire contract

The implementation targets the official Wire contract documented at:

https://www.themaestri.app/en/docs/wire

Wire is beta. The client must check `protocolVersion` and advertised capabilities before using optional routes.

Required protocol behavior:

- HTTPS/WSS only, default port 7434;
- self-signed host certificate supported through SPKI SHA-256 pinning;
- pairing returns a long-lived bearer token;
- write operations require a paired `owner` / Full control device;
- `401` means the pairing is no longer valid and the client must stop retrying;
- feed snapshots are the source of truth;
- a changed `epoch` requires a full resync.

Required capabilities for normal execution:

- `feedSnapshots`;
- `canvasMirroring`;
- `terminalStreaming`.

Useful optional capabilities are feature-gated, never probed blindly.

Important Wire identities:

- `TerminalCard.id` is the terminal route id used by terminal endpoints;
- `TerminalCard.nodeId` is the terminal's canvas node id;
- they are different ids.

`maestri-flow` binds workflow actors to **canvas `nodeId`**, then resolves the current `TerminalCard.id` from the live feed before dispatch. This avoids relying on display names and survives changes to the terminal's model, prompt, role name or presentation metadata as long as the canvas node remains the same.

The live canvas provides:

- `CanvasSnapshot.nodes`;
- `CanvasSnapshot.connections`;
- terminal metadata such as `name`, `agentType`, `roleName`, `isRunning`, `isActive`, `needsAttention`, `nodeId` and terminal `id`.

## 5. Product model

There are five separate concepts.

### 5.1 Canvas discovery

Wire tells the product what currently exists in the selected Maestri workspace/floor:

```text
Terminal node A
Terminal node B
Terminal node C
Note node N
Connections between nodes
```

This is discovery only. The engine assigns no meaning to A/B/C.

### 5.2 Actor bindings

The user creates arbitrary logical actors and binds each one to a canvas terminal.

Example only:

```text
Logical actor     Bound canvas terminal
----------------------------------------
implementer   ->  Bruttus
reviewer      ->  Sentinel
validator     ->  Marechal
```

Another workflow might use:

```text
researcher -> terminal A
writer     -> terminal B
editor     -> terminal C
```

Actor names are user data, not engine keywords.

A binding stores:

```yaml
actors:
  implementer:
    label: Implementer
    nodeId: "CANVAS-NODE-UUID"
    snapshot:
      terminalName: Bruttus
      roleName: Backend Engineer
      agentType: opencode
```

Only `nodeId` is authoritative. `snapshot` is UX metadata for explaining stale bindings.

### 5.3 Workflow graph

The user creates an arbitrary directed graph in the TUI. The graph contains generic node types and transitions. The engine has no domain vocabulary such as developer/reviewer/QA.

### 5.4 Work items

A workflow runs against durable work items. Work items may be independent or hierarchical (parent + children). This allows a parent item to aggregate smaller items before a later whole-item validation without making the engine understand what a "feature" or "task" means.

### 5.5 Execution state

The runtime persists active graph tokens, attempts, outcomes, parent/child progress and events. A restart never requires an LLM to reconstruct where the workflow was.

## 6. Interactive configuration experience

The primary configuration surface is a terminal TUI started with:

```bash
maestri-flow configure
```

The TUI uses the current Wire feed rather than asking the user to type terminal ids manually.

### Screen 1 — Host / workspace / floor

- connect or pair with Wire;
- choose a visible workspace;
- choose ground or a floor;
- show protocol/capability health.

### Screen 2 — Canvas discovery

Show every terminal on that floor with live metadata:

```text
[ ] Optimus      role: Tech Lead          agent: codex
[ ] Bruttus      role: Backend Engineer   agent: opencode
[ ] Sentinel     role: Code Reviewer      agent: claude
[ ] Cerberus     role: QA Engineer        agent: codex
```

For each terminal the TUI can also show which other canvas nodes it is connected to.

### Screen 3 — Actor binding

The user selects terminals and gives them arbitrary workflow actor keys/labels.

The TUI may suggest the terminal name or current Maestri role as a label, but never assigns semantics automatically.

### Screen 4 — Workflow builder

The user creates graph nodes, chooses their generic type, chooses an actor when applicable, declares allowed outcomes and selects transition targets.

Example presentation:

```text
Node: review
Type: task
Actor: reviewer

Outcomes:
  approved -> architecture-check
  rejected -> implement
```

These words are user-created configuration. The engine only sees strings and graph edges.

### Screen 5 — Topology policy

The user chooses how existing Maestri canvas cables affect validation:

- `strict`: actor-to-actor workflow hops must be supported by canvas connectivity;
- `advisory`: missing canvas connectivity produces warnings but does not block execution;
- `off`: canvas cables are display/context only.

Default: `advisory`.

The engine never derives workflow direction from `fromNodeId`/`toNodeId`. The configured workflow graph is authoritative.

### Screen 6 — Review and save

Before saving, the TUI shows:

- actor bindings;
- graph nodes and transitions;
- cycles;
- parallel forks/joins;
- unreachable nodes;
- terminal states;
- stale/missing canvas bindings;
- strict/advisory topology issues.

The resulting workflow is persisted as readable YAML so it can be versioned in Git even though normal users configure it through the TUI.

## 7. Generic workflow model

V1 supports these node types.

### 7.1 `task`

Dispatches work to one bound actor and waits for one declared outcome.

```yaml
review:
  type: task
  actor: reviewer
  prompt: Review the current work item.
  outcomes:
    approved: architecture-check
    rejected: implement
```

Outcome names are arbitrary strings selected by the user.

### 7.2 `parallel`

Creates execution tokens for multiple branches.

```yaml
checks:
  type: parallel
  branches:
    - security-check
    - ux-check
  join: checks-complete
```

Branches may contain their own loops before reaching the join.

### 7.3 `join`

Waits for all tokens created by its corresponding parallel fork, then continues once.

```yaml
checks-complete:
  type: join
  next: final-validation
```

The runtime associates join tokens with a persisted fork instance; it does not merely count node names globally.

### 7.4 `foreach`

Runs a named subflow for child work items and continues only after the configured child completion rule is satisfied.

```yaml
process-children:
  type: foreach
  source: children
  flow: child-flow
  concurrency: 1
  onComplete: whole-item-validation
```

This is generic parent/child work-item behavior. It can represent a feature composed of microtasks, chapters composed of sections, campaign items composed of assets, or any other hierarchy.

### 7.5 `terminal`

Ends the current flow with a semantic status.

```yaml
done:
  type: terminal
  status: completed
```

Supported runtime statuses are `completed`, `failed`, `paused` and `cancelled`; labels shown to the user may be customized.

## 8. Workflow document

A generated workflow may look like this:

```yaml
version: 2
name: custom-workflow
workspace:
  id: "WORKSPACE-UUID"
  floor: ground

topology:
  mode: advisory

actors:
  actor-a:
    label: Implementer
    nodeId: "NODE-A"
  actor-b:
    label: Reviewer
    nodeId: "NODE-B"
  actor-c:
    label: Architecture Validator
    nodeId: "NODE-C"
  actor-d:
    label: QA
    nodeId: "NODE-D"

flows:
  main:
    entry: process-children
    nodes:
      process-children:
        type: foreach
        source: children
        flow: child-flow
        concurrency: 1
        onComplete: whole-item-check

      whole-item-check:
        type: task
        actor: actor-d
        outcomes:
          accepted: done
          rejected: process-children

      done:
        type: terminal
        status: completed

  child-flow:
    entry: implement
    nodes:
      implement:
        type: task
        actor: actor-a
        outcomes:
          done: review

      review:
        type: task
        actor: actor-b
        outcomes:
          accepted: architecture-check
          rejected: implement

      architecture-check:
        type: task
        actor: actor-c
        outcomes:
          accepted: child-done
          rejected: implement

      child-done:
        type: terminal
        status: completed
```

Nothing in this schema tells the engine what "implement", "review" or "QA" means. Those are user labels.

## 9. Agent result protocol

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

## 10. Execution engine

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

## 11. Canvas binding resolution

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

## 12. Canvas connections and workflow edges

Canvas cables and workflow transitions are deliberately different concepts.

A canvas connection says two canvas objects are connected in Maestri. A workflow edge says execution may move from one workflow node to another under a configured condition.

The configuration UI can use canvas connections to:

- show relevant neighboring terminals;
- suggest likely workflow targets;
- warn when a configured hop has no corresponding cable;
- enforce cable presence in `strict` topology mode.

It must never infer role, direction or outcome from the cable itself.

## 13. Work queue and hierarchy

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

## 14. Persistence

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

## 15. Recovery and retries

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

## 16. CLI and TUI commands

Initial command surface:

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

`configure`, `enqueue` and `rebind` are interactive by default and also expose non-interactive flags later for automation.

## 17. Running inside or outside Maestri

`maestri-flow` is a normal Node.js process and may run:

- in a Shell terminal placed on the Maestri canvas; or
- outside Maestri in a normal terminal/service.

Running it on the canvas is recommended for visibility, not required for correctness.

The runtime does not need to be connected to agents through normal Maestri canvas cables to call Wire terminal routes. Canvas connections remain meaningful for user topology and optional validation.

## 18. Security

- Wire credentials are never committed to Git.
- Persist the bearer token outside workflow YAML.
- Pin the Wire host SPKI hash after pairing.
- Do not ship permanent TLS verification bypass.
- Redact bearer tokens from logs/errors.
- Do not log full terminal streams by default; store bounded diagnostic excerpts and structured results.
- Require Full control because prompt dispatch is a write operation.
- Make the paired device name clearly identifiable, e.g. `maestri-flow`.

## 19. Testing strategy

The test suite must not require real LLM calls.

### Unit tests

- workflow schema and graph validation;
- arbitrary actor keys and nodeId bindings;
- result envelope parsing;
- cycles;
- token transitions;
- parallel/fork/join semantics;
- foreach/subflow semantics;
- queue hierarchy;
- retry policy;
- stale binding handling;
- topology strict/advisory/off behavior.

### Wire contract tests

A fake Wire server implements the subset used by the runtime:

- `/api/info`;
- pairing;
- workspaces/feed;
- feed WebSocket;
- terminal prompt;
- terminal stream;
- status changes;
- epoch changes;
- 401/403/409 cases.

### Integration tests

1. Configure actors from a fake live canvas.
2. Execute a cyclic workflow (`A -> B -> A -> B -> done`).
3. Restart the process in the middle and resume from SQLite.
4. Execute two parallel branches and join exactly once.
5. Rebind a missing actor node and resume.
6. Process child work items through a subflow, then run a parent-level final task.
7. Complete one top-level item and automatically claim the next until the queue is empty.

## 20. Acceptance criteria

The project is complete when a user can:

1. pair it with Maestri Wire;
2. launch `maestri-flow configure`;
3. see the actual terminals and connections from the selected canvas;
4. assign arbitrary logical roles to selected terminals without relying on their names;
5. build and save an arbitrary cyclic workflow through the TUI;
6. create sequential, regression/retry, parallel/join and parent/child-subflow workflows without software-specific engine code;
7. enqueue work;
8. execute the workflow through Wire;
9. kill/restart the runner and resume without losing state;
10. rebind a missing canvas terminal without losing the workflow/run;
11. drain the configured queue until it is empty;
12. prove through tests that only declared transitions can occur.

## 21. Architectural principle

The final separation is:

```text
Maestri Canvas
  = live agents, terminals, roles, notes and visual connections

Wire
  = discovery + observation + execution transport

TUI
  = user-defined bindings + workflow authoring

Workflow Definition
  = source of truth for legal graph behavior

Runtime
  = deterministic executor

LLMs
  = workers inside task nodes
```

This separation is the feature. If role inference or workflow routing leaks back into an LLM, the design has failed.