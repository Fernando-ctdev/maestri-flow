# Maestri Flow — Design

Date: 2026-09-15
Status: Approved architecture — supersedes the previous software-specific draft

## 1. Goal

Build a deterministic, user-configurable workflow engine on top of **Maestri Wire** while preserving **Maestro Mode** as an optional natural-language provisioning layer.

Maestri remains the visual surface where terminals, agents, roles, notes, portals and connections live. A Maestro-enabled terminal may be selected as the **provisioner**: the user can speak naturally to it and let it recruit agents, assign roles, connect context and organize the team. `maestri-flow` then reads the resulting live canvas, lets the user bind those concrete terminals to arbitrary logical actors, lets the user author or select an arbitrary workflow in the TUI, and executes that workflow with deterministic state, retries, loops, parallel branches, joins and durable work queues.

The boundary is strict: Maestro may decide **how to prepare the team**, but never **which workflow transition happens next during a managed run**.

The runtime must **not** infer that a terminal is a developer, reviewer, architect, QA agent, researcher, writer, analyst, or anything else. Those are user-defined meanings.

The core rule is:

> **Maestro may provision. Canvas defines what exists. The user defines what it means and how it flows. The runtime alone enforces the configured workflow.**

## 2. Problem being solved

Maestro Mode is useful for free-form orchestration, but the control plane is still an LLM. In long or cyclic workflows the model must simultaneously remember the task, its role instructions, skills, prior outputs, who should run next, when to regress, when to retry and when the whole queue is done.

That makes the workflow probabilistic.

`maestri-flow` splits **provisioning** from **execution control**:

```text
User -> natural-language brief -> Maestro
                           -> recruits/configures/connects team
                           -> prepares context/work items

User confirms bindings + workflow

Maestri Flow
runtime -> dispatches configured node -> validates outcome -> applies declared edge -> persists state
```

Maestro remains useful where an LLM is strong: interpreting intent, assembling a team and organizing the canvas. The runtime takes over where deterministic behavior matters: routing, gates, retries, regression, queue draining and completion.

LLMs remain probabilistic inside provisioning and work steps. Managed workflow continuation is deterministic.

## 3. Non-goals

The engine is not:

- a replacement for Maestri's canvas;
- a replacement for Maestro Mode;
- a new AI agent;
- a hard-coded software development pipeline;
- a system that guesses roles from terminal names;
- a system that infers workflow semantics from canvas geometry;
- a replacement for the user's existing agent prompts/skills;
- a requirement that agents communicate directly with one another.

Maestro Mode is optional but first-class. A Maestro-enabled terminal can be selected as an out-of-band **provisioner** before a managed run. It may recruit, re-role and connect the team, but it is never the workflow authority. A Maestro terminal may also be bound separately as a normal workflow actor if the user explicitly chooses that; in that case the runtime still owns continuation.

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
- terminal metadata such as `name`, `agentType`, `roleName`, `isManager`, `isRunning`, `isActive`, `needsAttention`, `nodeId` and terminal `id`.

Wire also exposes canvas write routes, including terminal creation and connections. V1 deliberately does **not** duplicate Maestro's natural-language team-building behavior inside deterministic runtime code. Direct Wire canvas writes remain available for narrowly deterministic UI operations, while team composition is delegated to the selected Maestro when Maestro-assisted provisioning is used.

## 5. Product model

There are six separate concepts.

### 5.1 Maestro provisioning plane

A workflow profile may optionally bind one Maestro-enabled terminal as its **provisioner**. The provisioner is discovered from live terminal metadata (`isManager === true`) and stored by canvas `nodeId`, exactly like other stable canvas references.

The provisioner is **not** a workflow actor by default and is not part of the execution graph. It lives one layer above the graph:

```text
Natural-language intent
        |
        v
     Maestro
        | recruit / role / connect / organize
        v
   live Maestri canvas
        |
        v
TUI binding + workflow confirmation
        |
        v
 deterministic runtime
```

The user may talk to the Maestro directly in its terminal, or use `maestri-flow provision` / the TUI to send a provisioning brief through Wire. In both cases, the actual live canvas after provisioning is the source of truth. The runtime does not trust an LLM claim that a terminal exists if the Wire feed does not contain it.

When Flow sends the provisioning brief, it appends a small handoff contract. The Maestro may return a summary and structured proposed work items, but those work items are **staged** and require validation/confirmation before entering the durable queue. Actor bindings are always made from the refreshed canvas, never from LLM-supplied terminal names or guessed ids.

### 5.2 Canvas discovery

Wire tells the product what currently exists in the selected Maestri workspace/floor:

```text
Terminal node A
Terminal node B
Terminal node C
Note node N
Connections between nodes
```

This is discovery only. The engine assigns no meaning to A/B/C.

### 5.3 Actor bindings

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

### 5.4 Workflow graph

The user creates an arbitrary directed graph in the TUI. The graph contains generic node types and transitions. The engine has no domain vocabulary such as developer/reviewer/QA.

### 5.5 Work items

A workflow runs against durable work items. Work items may be independent or hierarchical (parent + children). This allows a parent item to aggregate smaller items before a later whole-item validation without making the engine understand what a "feature" or "task" means.

### 5.6 Execution state

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

### Screen 2 — Provisioning choice

If one or more live terminals have `isManager === true`, offer:

- **Use existing canvas** — skip provisioning and configure from what already exists;
- **Use Maestro to provision** — select a Maestro terminal and provide a natural-language team/task brief;
- **Talk to Maestro directly** — leave the TUI, converse with the selected Maestro terminal normally, then return and refresh.

In the integrated path, Flow sends the brief to the selected Maestro through Wire, watches the feed until the provisioning interaction completes, then performs a full feed refresh. Canvas mutations are observed, not inferred from the Maestro's prose.

The provisioning result may stage structured work items for import. The user reviews them before they are persisted to the queue.

### Screen 3 — Canvas discovery

Show every terminal on that floor with live metadata:

```text
[ ] Optimus      role: Tech Lead          agent: codex
[ ] Bruttus      role: Backend Engineer   agent: opencode
[ ] Sentinel     role: Code Reviewer      agent: claude
[ ] Cerberus     role: QA Engineer        agent: codex
```

For each terminal the TUI can also show which other canvas nodes it is connected to.

### Screen 4 — Actor binding

The user selects terminals and gives them arbitrary workflow actor keys/labels.

The TUI may suggest the terminal name or current Maestri role as a label, but never assigns semantics automatically.

### Screen 5 — Workflow builder

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

### Screen 6 — Topology policy

The user chooses how existing Maestri canvas cables affect validation:

- `strict`: actor-to-actor workflow hops must be supported by canvas connectivity;
- `advisory`: missing canvas connectivity produces warnings but does not block execution;
- `off`: canvas cables are display/context only.

Default: `advisory`.

The engine never derives workflow direction from `fromNodeId`/`toNodeId`. The configured workflow graph is authoritative.

### Screen 7 — Review and save

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

