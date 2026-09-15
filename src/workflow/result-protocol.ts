import { z } from "zod"; const result=z.object({outcome:z.string(),summary:z.string().optional(),data:z.unknown().optional()});
export type FlowResult=z.infer<typeof result>;
export function extractFlowResult(text:string):FlowResult|null{const re=/\[\[MAESTRI_FLOW_RESULT\]\]\s*(\{[^\n]*\})/g;let found:FlowResult|null=null;for(const m of text.matchAll(re))try{const v=result.safeParse(JSON.parse(m[1]));if(v.success)found=v.data;}catch{}return found;}
