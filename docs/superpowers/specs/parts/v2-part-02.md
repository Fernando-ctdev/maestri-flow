## 17. CLI and TUI commands

Initial command surface:

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
```

`configure`, `enqueue` and `rebind` are interactive by default and also expose non-interactive flags later for automation.

## 18. Running inside or outside Maestri

`maestri-flow` is a normal Node.js process and may run:

- in a Shell terminal placed on the Maestri canvas; or
- outside Maestri in a normal terminal/service.

Running it on the canvas is recommended for visibility, not required for correctness.

A common hybrid layout is a Maestro terminal plus a Shell terminal running `maestri-flow`. The Maestro remains the natural-language entry point for team provisioning; the Shell/TUI is the deterministic execution control plane. They communicate through the shared Wire-visible canvas and, when Flow initiates provisioning, through direct Wire prompt dispatch to the selected Maestro terminal.

The runtime does not need to be connected to agents through normal Maestri canvas cables to call Wire terminal routes. Canvas connections remain meaningful for user topology, Maestro-created context sharing and optional validation.

## 19. Security

- Wire credentials are never committed to Git.
- Persist the bearer token outside workflow YAML.
- Pin the Wire host SPKI hash after pairing.
- Do not ship permanent TLS verification bypass.
- Redact bearer tokens from logs/errors.
- Do not log full terminal streams by default; store bounded diagnostic excerpts and structured results.
- Require Full control because prompt dispatch is a write operation.
- Make the paired device name clearly identifiable, e.g. `maestri-flow`.
- Treat Maestro provisioning output as untrusted input: validate/stage work items and never accept routing/binding ids from LLM prose.

## 20. Testing strategy

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
- topology strict/advisory/off behavior;
- Maestro provisioner selection by `isManager` + `nodeId`;
- provisioning result staging/validation.

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

1. Select a fake `isManager` Maestro, send a provisioning brief, observe new canvas terminals, refresh, and bind actors from the resulting feed.
2. Configure actors from a fake live canvas without Maestro provisioning.
3. Execute a cyclic workflow (`A -> B -> A -> B -> done`).
4. Restart the process in the middle and resume from SQLite.
5. Execute two parallel branches and join exactly once.
6. Rebind a missing actor node and resume.
7. Process child work items through a subflow, then run a parent-level final task.
8. Complete one top-level item and automatically claim the next until the queue is empty.

## 21. Acceptance criteria

The project is complete when a user can:

1. pair it with Maestri Wire;
2. optionally select an existing Maestro (`isManager`) as a provisioning terminal;
3. send that Maestro a natural-language provisioning brief through Flow **or** provision directly in the Maestro terminal and refresh;
4. observe the actual resulting terminals/connections from Wire rather than trusting the Maestro's prose;
5. review/import staged work items proposed by the provisioning interaction;
6. launch `maestri-flow configure`;
7. assign arbitrary logical roles to selected terminals without relying on their names;
8. build and save an arbitrary cyclic workflow through the TUI;
9. create sequential, regression/retry, parallel/join and parent/child-subflow workflows without software-specific engine code;
10. start a managed run only after explicit binding/workflow confirmation;
11. execute the workflow through Wire while Maestro has no authority over transitions;
12. pause, re-provision/rebind and resume without losing workflow state;
13. kill/restart the runner and resume without losing state;
14. drain the configured queue until it is empty;
15. prove through tests that only declared transitions can occur.

## 22. Architectural principle

The final separation is:

```text
Human
  = intent, approval and final authority

Maestro (optional provisioning plane)
  = natural-language team creation, roles, connections, context organization and work decomposition

Maestri Canvas
  = live agents, terminals, roles, notes, portals and visual connections

Wire
  = discovery + observation + execution/provisioning transport

TUI
  = provisioning handoff, user-defined bindings + workflow authoring/review

Workflow Definition
  = source of truth for legal graph behavior

Runtime
  = deterministic executor

Worker LLMs
  = probabilistic work inside task nodes
```

The key rule is not "remove Maestro". It is **keep Maestro out of deterministic continuation**. Maestro may create and organize the team; once a run starts, the runtime owns every transition until the run is paused or finishes.

If workflow routing leaks back into an LLM, the design has failed.
