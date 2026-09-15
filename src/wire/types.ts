export interface TerminalCard { id:string; nodeId:string; name:string; agentType:string; roleName?:string; floorId?:string; floorName:string; isManager:boolean; isRunning:boolean; isActive?:boolean; needsAttention:boolean; isLive:boolean; isUnloaded?:boolean; preview:string[]; status?:string; cols?:number; rows?:number; }
export interface Connection { id:string; fromNodeId:string; toNodeId:string; kind:string; isActive:boolean; points?: Array<{x:number;y:number}>; }
export interface CanvasNode { id:string; kind:string; title?:string; terminal?:TerminalCard; [key:string]:unknown; }
export interface FeedSnapshot { workspace?: Record<string,unknown>; floors?:unknown[]; items?:Array<{kind:string;terminal?:TerminalCard;[key:string]:unknown}>; canvas:{nodes:CanvasNode[];connections:Connection[];[key:string]:unknown}; epoch:string; sequence?:number; }
export interface WireInfo { protocolVersion:number; capabilities:string[]; [key:string]:unknown; }
export interface WorkspaceMeta { id:string; name:string; [key:string]:unknown; }
export interface PairInput { code?:string; password?:string; deviceIdentifier?:string; serverKeyHash?:string; serverCertificate?:string; host?:string; port?:number; alternateHosts?:string[]; }
export interface Credentials { host:string; port:number; token:string; deviceId:string; serverKeyHash:string; protocolVersion:number; alternateHosts?:string[]; }
