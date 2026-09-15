import { discoverCanvas } from "../canvas/discovery.js";
import type { WireClient } from "../wire/client.js";
import type { ProvisionerBinding, ProvisioningProposal } from "./types.js";
import type { QueueService } from "../queue/service.js";
import { listProvisioners, refreshCanvas, runProvisioning } from "./service.js";

type ProvisioningWire = Pick<WireClient, "listWorkspaces" | "getFeed" | "sendPrompt">;

export function createProvisioningCallbacks(wire: ProvisioningWire, workspaceId: string, floor = "ground", queue?: QueueService) {
  const getFeed = () => wire.getFeed(workspaceId, floor);
  return {
    listWorkspaces: () => wire.listWorkspaces(),
    refreshCanvas: () => refreshCanvas(getFeed),
    listProvisioners: async () => listProvisioners(await refreshCanvas(getFeed)),
    provision: async (provisioner: ProvisionerBinding, brief: string, options?: { timeoutMs?: number; pollMs?: number }) => runProvisioning({ discovery: discoverCanvas(await getFeed()), provisioner, brief, getFeed, sendPrompt: wire.sendPrompt.bind(wire), ...options }),
    confirmProposal: (proposal: ProvisioningProposal) => { if (!queue) throw new Error("queue is not configured"); return queue.createMany(proposal.workItems.map(item => ({ id:item.key, parentId:item.parentKey ?? undefined, title:item.title, body:item.body ?? "", metadata:item.metadata ?? {} }))); },
    discardProposal: () => undefined,
  };
}
