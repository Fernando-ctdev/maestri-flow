import type { TaskNode, TerminalNode, WorkflowDefinitionV2 } from "./schema.js";
import type { ActorBinding } from "../canvas/bindings.js";

export type TaskDraft = Omit<TaskNode, "type">;
export type TerminalStatus = TerminalNode["status"];

function withNode(workflow: WorkflowDefinitionV2, flowId: string, nodeId: string, node: TaskNode | TerminalNode): WorkflowDefinitionV2 {
  const flow = workflow.flows[flowId];
  if (flow?.nodes[nodeId]) throw new Error(`node ${flowId}/${nodeId} already exists`);
  return { ...workflow, flows: { ...workflow.flows, [flowId]: flow ? { ...flow, nodes: { ...flow.nodes, [nodeId]: node } } : { entry: nodeId, nodes: { [nodeId]: node } } } };
}

export function addTask(workflow: WorkflowDefinitionV2, flowId: string, nodeId: string, task: TaskDraft): WorkflowDefinitionV2 {
  return withNode(workflow, flowId, nodeId, { type: "task", ...task });
}

export function addTerminal(workflow: WorkflowDefinitionV2, flowId: string, nodeId: string, status: TerminalStatus = "completed"): WorkflowDefinitionV2 {
  return withNode(workflow, flowId, nodeId, { type: "terminal", status });
}

export function setOutcome(workflow: WorkflowDefinitionV2, flowId: string, nodeId: string, outcome: string, target: string): WorkflowDefinitionV2 {
  const flow = workflow.flows[flowId];
  const node = flow?.nodes[nodeId];
  if (node?.type !== "task") throw new Error(`node ${flowId}/${nodeId} is not a task`);
  return { ...workflow, flows: { ...workflow.flows, [flowId]: { ...flow, nodes: { ...flow.nodes, [nodeId]: { ...node, outcomes: { ...node.outcomes, [outcome]: target } } } } } };
}

export function bindingsToActors(bindings: Record<string, ActorBinding>): WorkflowDefinitionV2["actors"] {
  return Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key, { label: binding.label, nodeId: binding.nodeId }]));
}
