import type {CanvasDiscovery} from "../canvas/discovery.js"; import type {ProvisionerBinding,ProvisioningProposal} from "./types.js"; import {parseProvisioningResult} from "./result-protocol.js";
export function listProvisioners(c:CanvasDiscovery){return c.terminals.filter(t=>t.isManager&&t.isLive).map(t=>({nodeId:t.nodeId,terminalId:t.id,name:t.name,agentType:t.agentType,roleName:t.roleName}));}
export function stageProposal(text:string):ProvisioningProposal|null{return parseProvisioningResult(text);}
export interface ProvisioningHandoff{refreshedCanvas:CanvasDiscovery;stagedProposal:ProvisioningProposal|null}
export function directRefresh(canvas:CanvasDiscovery):ProvisioningHandoff{return {refreshedCanvas:canvas,stagedProposal:null};}
