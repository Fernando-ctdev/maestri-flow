import { parse, stringify } from "yaml"; import { readFile,writeFile } from "node:fs/promises"; import { workflowSchema, type WorkflowDefinitionV2 } from "./schema.js";
export function parseWorkflowYaml(text:string):WorkflowDefinitionV2{return workflowSchema.parse(parse(text));}
export async function loadWorkflowFile(file:string){return parseWorkflowYaml(await readFile(file,"utf8"));}
export async function saveWorkflowFile(file:string,w:WorkflowDefinitionV2){await writeFile(file,stringify(w));}
