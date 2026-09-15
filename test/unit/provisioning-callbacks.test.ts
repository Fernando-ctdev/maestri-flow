import { describe, expect, it } from "vitest";
import { createProvisioningCallbacks } from "../../src/provisioning/callbacks.js";
import { DatabaseContext } from "../../src/persistence/db.js";
import { QueueService } from "../../src/queue/service.js";

const feed = (preview: string[] = [], running = true) => ({ epoch: "e", canvas: { connections: [], nodes: [{ id: "n", kind: "terminal", terminal: { id: "t", nodeId: "n", name: "Maestro", agentType: "x", floorName: "ground", isManager: true, isRunning: running, needsAttention: false, isLive: true, preview } }] } });

describe("provisioning callbacks", () => {
  it("uses the chosen workspace and manager, staging but not applying a proposal", async () => {
    const snapshots = [feed(), feed(), feed(['[[MAESTRI_FLOW_PROVISIONING_RESULT]] {"workItems":[{"key":"a","title":"A"}]}'], false)];
    const sent: string[] = [];
    const wire: any = { listWorkspaces: async () => [{ id: "w", name: "W" }], getFeed: async (workspace: string) => { expect(workspace).toBe("w"); return snapshots.shift()!; }, sendPrompt: async (_id: string, text: string) => { sent.push(text); } };
    const db = new DatabaseContext(); const api = createProvisioningCallbacks(wire, "w", "ground", new QueueService(db));
    await expect(api.listWorkspaces()).resolves.toEqual([{ id: "w", name: "W" }]);
    await expect(api.provision({ nodeId: "n", snapshot: {} }, "brief", { pollMs: 0, timeoutMs: 10 })).resolves.toMatchObject({ stagedProposal: { workItems: [{ key: "a" }] } });
    expect(sent[0]).toContain("brief");
    expect(api.confirmProposal({ workItems: [{ key: "a", title: "A" }] })).toEqual(["a"]);
    expect(db.db.prepare("SELECT id FROM work_items").all()).toEqual([{ id: "a" }]);
    expect(api.discardProposal()).toBeUndefined();
  });
});
