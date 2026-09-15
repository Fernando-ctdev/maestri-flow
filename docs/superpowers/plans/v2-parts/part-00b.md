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

### Task 5: Add the optional Maestro provisioning bridge

**Files:**
- Create: `src/provisioning/types.ts`
- Create: `src/provisioning/result-protocol.ts`
- Create: `src/provisioning/service.ts`
- Test: `test/unit/provisioning.test.ts`
- Test: `test/integration/maestro-provisioning.test.ts`
- Modify: `test/support/fake-wire-server.ts`
- Modify: `test/support/fixtures.ts`

**Interfaces:**
- Produces `ProvisionerBinding { nodeId: string; snapshot: ProvisionerSnapshot }`.
- Produces `listProvisioners(canvas): ProvisionerCandidate[]`, filtering only live terminals with `isManager === true`.
- Produces `runProvisioning(input): Promise<ProvisioningHandoff>`.
- Produces `parseProvisioningResult(text): ProvisioningProposal | null`.
- Produces staged `ProposedWorkItem[]`; it never writes the durable queue directly.

- [ ] **Step 1: Write failing unit tests for manager discovery and stable binding**

Cover:

```ts
expect(listProvisioners(canvas).map((p) => p.nodeId)).toEqual(["manager-node"]);
expect(listProvisioners(canvas)).not.toContainEqual(expect.objectContaining({ nodeId: "worker-node" }));
```

Renaming the manager or changing its role/model must not invalidate a binding that still points to the same canvas `nodeId`.

- [ ] **Step 2: Define provisioning types**

Use domain-neutral structures:

```ts
export interface ProvisionerBinding {
  nodeId: string;
  snapshot: {
    terminalName?: string;
    roleName?: string;
    agentType?: string;
  };
}

export interface ProposedWorkItem {
  key: string;
  title: string;
  body?: string;
  parentKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProvisioningProposal {
  summary?: string;
  workItems: ProposedWorkItem[];
}
```

Do not put actor bindings, terminal ids or workflow transitions in `ProvisioningProposal`.

- [ ] **Step 3: Write failing tests for the provisioning result envelope**

Accept only a final marker:

```text
[[MAESTRI_FLOW_PROVISIONING_RESULT]] {"summary":"ready","workItems":[...]}
```

Reject malformed JSON, duplicate work-item keys, invalid parent references and any unknown routing fields such as `actors`, `nodeIds`, `transitions` or `terminalIds`.

- [ ] **Step 4: Implement the result parser/validator**

Use Zod. Parsing a proposal never mutates SQLite. Return a staged proposal for the caller/TUI to review.

- [ ] **Step 5: Extend the fake Wire server with a manager provisioning scenario**

When a configured fake `isManager` terminal receives a provisioning prompt, the fixture may simulate Maestro behavior by:

1. adding one or more new terminal nodes/connections to the authoritative fake feed snapshot;
2. publishing the updated feed epoch/snapshot event expected by the sync layer;
3. emitting a final provisioning result marker from the manager stream.

Tests must assert Flow discovers the new terminals from the refreshed feed rather than from the marker text.

- [ ] **Step 6: Implement `runProvisioning`**

Algorithm:

```text
resolve provisioner nodeId -> current TerminalCard.id
assert isManager === true
capture pre-provision feed snapshot
send natural-language brief + provisioning handoff contract
observe terminal/feed until the provisioning interaction completes or times out
refresh authoritative feed snapshot
compute canvas delta for UX only
parse optional work-item proposal
return { refreshedCanvas, delta, stagedProposal }
```

The service must not bind newly created agents automatically and must not create workflow edges.

- [ ] **Step 7: Prove direct-Maestro/manual provisioning remains supported**

Add a service path that performs no prompt dispatch: refresh the feed and return the current canvas so a user can talk directly to Maestro, come back to Flow, and continue configuration.

- [ ] **Step 8: Run tests**

```bash
npm test -- test/unit/provisioning.test.ts test/integration/maestro-provisioning.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/provisioning test/unit/provisioning.test.ts test/integration/maestro-provisioning.test.ts test/support
 git commit -m "feat: add maestro provisioning bridge"
```

---

### Task 6: Define stable user-owned actor bindings by canvas node id

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
