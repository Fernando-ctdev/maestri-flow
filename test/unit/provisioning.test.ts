import { describe, expect, it } from "vitest";
import { discoverCanvas } from "../../src/canvas/discovery.js";
import { refreshCanvas, runProvisioning } from "../../src/provisioning/service.js";

const snapshot = (preview: string[], running = true) => ({ epoch: "e", canvas: { connections: [], nodes: [{ id: "manager", kind: "terminal", terminal: { id: "terminal", nodeId: "manager", name: "Maestro", agentType: "x", floorName: "ground", isManager: true, isRunning: running, needsAttention: false, isLive: true, preview } }] } });

describe("runProvisioning", () => {
  it("refreshes Canvas from the authoritative feed", async () => {
    await expect(refreshCanvas(async () => snapshot([]))).resolves.toMatchObject({ terminals: [{ nodeId: "manager" }] });
  });
  it("dispatches to the selected live manager, refreshes the feed and stages its proposal", async () => {
    const feeds = [snapshot([]), snapshot(['[[MAESTRI_FLOW_PROVISIONING_RESULT]] {"workItems":[{"key":"a","title":"A"}]}'], false)];
    const prompts: string[] = [];
    const result = await runProvisioning({ discovery: discoverCanvas(feeds[0]), provisioner: { nodeId: "manager", snapshot: {} }, brief: "Build a team", getFeed: async () => feeds.shift()!, sendPrompt: async (_id, text) => { prompts.push(text); }, pollMs: 0, timeoutMs: 10 });
    expect(prompts[0]).toContain("Build a team");
    expect(result.stagedProposal?.workItems[0].key).toBe("a");
    expect(result.refreshedCanvas.terminals).toHaveLength(1);
  });
});
