export interface ProvisionerBinding{nodeId:string;snapshot:{terminalName?:string;roleName?:string;agentType?:string}}
export interface ProposedWorkItem{key:string;title:string;body?:string;parentKey?:string|null;metadata?:Record<string,unknown>}
export interface ProvisioningProposal{summary?:string;workItems:ProposedWorkItem[]}
