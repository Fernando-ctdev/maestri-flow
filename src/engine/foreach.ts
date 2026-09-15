export interface ChildRunRequest{parentTokenId:string;workItemId:string;flowId:string}
export function nextChildren(children:string[],running:number,concurrency:number):string[]{return children.slice(running,running+Math.max(0,concurrency-running));}
