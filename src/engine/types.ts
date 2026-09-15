export type TokenStatus="ready"|"dispatched"|"waiting"|"completed"|"cancelled";
export interface ForkContext{forkId:string;joinNodeId:string;branchId:string}
export interface ExecutionToken{id:string;runId:string;workItemId:string;flowId:string;nodeId:string;status:TokenStatus;forkStack:ForkContext[]}
export type EngineEvent={type:"TASK_RESULT";tokenId:string;outcome:string}|{type:"TASK_DISPATCHED";tokenId:string}|{type:"PAUSE_TOKEN";tokenId:string;reason:string}|{type:"RESUME_TOKEN";tokenId:string};
export interface EngineState{tokens:ExecutionToken[];runStatus?:string}
