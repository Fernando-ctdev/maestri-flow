import type { ActorBinding } from "../canvas/bindings.js";
import type { WorkflowDefinitionV2, TerminalNode } from "../workflow/schema.js";
import { addTask, addTerminal, setOutcome, bindingsToActors } from "../workflow/draft.js";
import type { CanvasDiscovery } from "../canvas/discovery.js";

export interface ConfigureState {
  screen: string;
  discovery?: CanvasDiscovery;
  provisioner?: unknown;
  stagedProvisioningProposal?: unknown;
  actorBindings: Record<string, ActorBinding>;
  draftWorkflow?: WorkflowDefinitionV2;
  validation: unknown[];
  connection?: "idle" | "loading" | "connected" | "error";
  error?: string;
  workspace?: string;
  floor?: string;
}

export type ConfigureAction =
  | { type: "DISCOVERY" | "REFRESH_CANVAS"; discovery: CanvasDiscovery }
  | { type: "BIND_ACTOR"; binding: ActorBinding }
  | { type: "UNBIND_ACTOR"; key: string }
  | { type: "PROVISIONER"; binding: unknown }
  | { type: "STAGE_PROPOSAL"; proposal: unknown }
  | { type: "ACCEPT_PROPOSAL" }
  | { type: "REJECT_PROPOSAL" }
  | { type: "WORKFLOW"; workflow: WorkflowDefinitionV2 }
  | { type: "VALIDATION"; issues: unknown[] }
  | { type: "DRAFT_TASK"; key: string; actor: string; prompt?: string }
  | { type: "DRAFT_TERMINAL"; key: string; status?: TerminalNode["status"] }
  | { type: "DRAFT_OUTCOME"; key: string; outcome: string; target: string }
  | { type: "SCREEN"; screen: string };

function blankDraft(s: ConfigureState): WorkflowDefinitionV2 {
  return {
    version: 2,
    name: "draft",
    workspace: { id: s.workspace ?? "", floor: s.floor ?? "base" },
    topology: { mode: "advisory" },
    actors: bindingsToActors(s.actorBindings),
    flows: {},
  };
}

export function reduceConfigureState(s: ConfigureState, a: ConfigureAction): ConfigureState {
  if (a.type === "DISCOVERY" || a.type === "REFRESH_CANVAS") return { ...s, discovery: a.discovery, screen: "canvas" };
  if (a.type === "BIND_ACTOR") return { ...s, actorBindings: { ...s.actorBindings, [a.binding.key]: a.binding }, screen: "bindings" };
  if (a.type === "UNBIND_ACTOR") { const next = { ...s.actorBindings }; delete next[a.key]; return { ...s, actorBindings: next }; }
  if (a.type === "PROVISIONER") return { ...s, provisioner: a.binding, screen: "provisioning" };
  if (a.type === "STAGE_PROPOSAL") return { ...s, stagedProvisioningProposal: a.proposal, screen: "review" };
  if (a.type === "ACCEPT_PROPOSAL") return { ...s, screen: "enqueue" };
  if (a.type === "REJECT_PROPOSAL") return { ...s, stagedProvisioningProposal: undefined };
  if (a.type === "WORKFLOW") return { ...s, draftWorkflow: a.workflow, screen: "review" };
  if (a.type === "VALIDATION") return { ...s, validation: a.issues, screen: "review" };
  if (a.type === "DRAFT_TASK" || a.type === "DRAFT_TERMINAL") {
    try {
      const draft = s.draftWorkflow ?? blankDraft(s);
      const next = a.type === "DRAFT_TASK"
        ? addTask(draft, "main", a.key, { actor: a.actor, outcomes: {}, ...(a.prompt ? { prompt: a.prompt } : {}) })
        : addTerminal(draft, "main", a.key, a.status ?? "completed");
      return { ...s, draftWorkflow: next };
    } catch { return s; }
  }
  if (a.type === "DRAFT_OUTCOME") {
    if (!s.draftWorkflow) return s;
    try { return { ...s, draftWorkflow: setOutcome(s.draftWorkflow, "main", a.key, a.outcome, a.target) }; } catch { return s; }
  }
  if (a.type === "SCREEN") return { ...s, screen: a.screen };
  return s;
}
