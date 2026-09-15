import type { FeedSnapshot, TerminalCard } from "../wire/types.js";
export interface CanvasTerminal extends TerminalCard { connectedNodeIds:string[]; }
export interface CanvasDiscovery { terminals:CanvasTerminal[]; connections:FeedSnapshot["canvas"]["connections"]; }
export function discoverCanvas(snapshot:FeedSnapshot):CanvasDiscovery { const ts:CanvasTerminal[]=(snapshot.canvas.nodes??[]).filter(n=>n.kind==="terminal"&&n.terminal).map(n=>({...n.terminal!,connectedNodeIds:[] })); const by=new Map<string,CanvasTerminal>(ts.map(t=>[t.nodeId,t])); for(const c of snapshot.canvas.connections??[]){by.get(c.fromNodeId)?.connectedNodeIds.push(c.toNodeId);by.get(c.toNodeId)?.connectedNodeIds.push(c.fromNodeId);} return {terminals:ts,connections:snapshot.canvas.connections??[]}; }
export function areCanvasNodesConnected(d:CanvasDiscovery,a:string,b:string):boolean { return d.connections.some(c=>c.isActive&&((c.fromNodeId===a&&c.toNodeId===b)||(c.fromNodeId===b&&c.toNodeId===a))); }
