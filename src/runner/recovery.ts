export type RecoveryAction="RETRY"|"PAUSE"|"REPAIR_PAIRING_REQUIRED"|"RECONNECT";
export function recover(error:{status?:number;code?:string},attempt:number,maxAttempts=3):RecoveryAction{if(error.status===401)return "REPAIR_PAIRING_REQUIRED";if(error.code==="disconnect")return "RECONNECT";return attempt<maxAttempts?"RETRY":"PAUSE";}
