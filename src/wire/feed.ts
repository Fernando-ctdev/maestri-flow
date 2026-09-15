import type { FeedSnapshot } from "./types.js";
export class FeedSession {
  private snapshot?:FeedSnapshot; private key?:string; private resync=false;
  accept(message:unknown): "accepted"|"ignored"|"resync" { const m=message as any; if(m?.type!=="feed" || !m.snapshot) return "ignored"; const s=m.snapshot as FeedSnapshot; if(this.snapshot?.epoch===s.epoch && s.sequence!==undefined && this.snapshot.sequence!==undefined && s.sequence<=this.snapshot.sequence) return "ignored"; const changed=!!this.snapshot&&s.epoch!==this.snapshot.epoch; if(changed){this.snapshot=undefined;this.key=undefined;this.resync=true;return "resync";} this.snapshot=s;this.key=`${s.epoch}:${s.sequence ?? "full"}`;return "accepted"; }
  acceptFullSnapshot(snapshot:FeedSnapshot){this.snapshot=snapshot;this.key=`${snapshot.epoch}:${snapshot.sequence??"full"}`;this.resync=false;}
  current():FeedSnapshot|undefined { return this.snapshot; }
  requiresResync():boolean { return this.resync; }
}
