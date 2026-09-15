import https from "node:https";
import { verifySpki } from "./tls-pin.js";
import type { Credentials, FeedSnapshot, PairInput, WireInfo, WorkspaceMeta } from "./types.js";

export class WireError extends Error { constructor(public status:number, message:string) { super(message); } }
export class WireClient {
  constructor(private readonly credentials: Credentials | null, private readonly requestImpl = requestJson, private readonly bootstrap:{host:string;port:number;serverKeyHash:string;serverCertificate?:string}={host:"localhost",port:7434,serverKeyHash:""}) {}
  async getInfo(): Promise<WireInfo> { const info = await this.requestImpl(this.url("/api/info"), { method:"GET", serverKeyHash:this.credentials?.serverKeyHash, ca:(this.credentials as any)?.serverCertificate }); validateInfo(info); return info as WireInfo; }
  async pair(input: PairInput): Promise<Credentials> {
    if ((input.code ? 1 : 0) + (input.password ? 1 : 0) !== 1) throw new Error("exactly one pairing credential is required");
    const info = await this.requestImpl(this.bootstrapUrl(input, "/api/info"), { method:"GET", serverKeyHash:input.serverKeyHash??this.bootstrap.serverKeyHash, ca:input.serverCertificate??this.bootstrap.serverCertificate }); validateInfo(info);
    const result = await this.requestImpl(this.bootstrapUrl(input, "/pair"), { method:"POST", serverKeyHash:input.serverKeyHash??this.bootstrap.serverKeyHash, ca:input.serverCertificate??this.bootstrap.serverCertificate, body:{ deviceName:"maestri-flow", ...(input.code ? {code:input.code} : {password:input.password}), ...(input.deviceIdentifier ? {deviceIdentifier:input.deviceIdentifier} : {}) } });
    if (result.role !== "owner") throw new Error("Full control/owner pairing is required");
    return { host:input.host ?? this.credentials?.host ?? this.bootstrap.host, port:input.port ?? this.credentials?.port ?? this.bootstrap.port, token:String(result.token), deviceId:String(result.deviceId), serverKeyHash:String(input.serverKeyHash ?? this.bootstrap.serverKeyHash), alternateHosts:input.alternateHosts, protocolVersion:info.protocolVersion };
  }
  async listWorkspaces(): Promise<WorkspaceMeta[]> { const x=await this.api("/api/workspaces"); return (x.workspaces ?? []) as WorkspaceMeta[]; }
  async getFeed(workspaceId:string, floor="ground"): Promise<FeedSnapshot> { return await this.api(`/api/workspaces/${encodeURIComponent(workspaceId)}/feed?floor=${encodeURIComponent(floor)}`) as FeedSnapshot; }
  async sendPrompt(terminalId:string, text:string): Promise<void> { await this.api(`/api/terminals/${encodeURIComponent(terminalId)}/prompt`, {method:"POST",body:{text}}); }
  private async api(url:string, options:RequestOptions={}) { if (!this.credentials) throw new Error("pairing required"); return this.requestImpl(this.url(url), {...options, serverKeyHash:this.credentials.serverKeyHash, headers:{Authorization:`Bearer ${this.credentials.token}`,...(options.headers??{})}}); }
  private url(route:string) { return `https://${this.credentials?.host ?? "localhost"}:${this.credentials?.port ?? 7434}${route}`; }
  private bootstrapUrl(input:PairInput, route:string) { return `https://${input.host ?? this.bootstrap.host}:${input.port ?? this.bootstrap.port}${route}`; }
}
type RequestOptions={method?:string;body?:unknown;headers?:Record<string,string>;serverKeyHash?:string;ca?:string};
async function requestJson(url:string, options:RequestOptions):Promise<any>{
  const parsed=new URL(url);
  const body=options.body===undefined?undefined:JSON.stringify(options.body);
  return new Promise((resolve,reject)=>{const strictTrust=Boolean(options.ca)||!options.serverKeyHash;const req=https.request({hostname:parsed.hostname,port:parsed.port,path:`${parsed.pathname}${parsed.search}`,method:options.method??"GET",headers:{"content-type":"application/json",...(body?{"content-length":Buffer.byteLength(body)}:{}),...(options.headers??{})},ca:options.ca,rejectUnauthorized:strictTrust,checkServerIdentity:(_host,cert)=>options.serverKeyHash&&cert.raw&&!verifySpki(cert.raw,options.serverKeyHash)?new Error("Wire SPKI pin mismatch"):undefined},res=>{let data="";res.setEncoding("utf8");res.on("data",c=>data+=c);res.on("end",()=>{if(res.statusCode===401)return reject(new WireError(401,"pairing required"));if(res.statusCode===403)return reject(new WireError(403,"operation forbidden"));if(!res.statusCode||res.statusCode>=400)return reject(new WireError(res.statusCode??0,`Wire request failed (${res.statusCode??0})`));try{resolve(data?JSON.parse(data):{});}catch{reject(new Error("invalid Wire JSON"));}});});req.on("socket",socket=>socket.once("secureConnect",()=>{if(options.serverKeyHash){const raw=(socket as any).getPeerCertificate(true)?.raw;if(!raw||!verifySpki(raw,options.serverKeyHash)){req.destroy(new Error("Wire SPKI pin mismatch"));}}}));req.on("error",reject);if(body)req.write(body);req.end();});
}
export function validateInfo(info: Partial<WireInfo>): asserts info is WireInfo { if(info.protocolVersion!==1) throw new Error("unsupported Wire protocol"); const required=["feedSnapshots","canvasMirroring","terminalStreaming"]; if(!required.every(x=>info.capabilities?.includes(x))) throw new Error("required Wire capability missing"); }
