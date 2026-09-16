import React, { useEffect, useState } from "react";
import { Box, Text, render, useInput } from "ink";
import { resolveLanguage, type Language } from "../config/language.js";
import { loadWireConfig, saveWireConfig, type WireConfig } from "../config/wire.js";
import { saveCredentials } from "../config/credentials.js";
import { WireClient } from "../wire/client.js";
import { listProvisioners, runProvisioning } from "../provisioning/service.js";
import type { ProvisionerBinding, ProvisioningProposal } from "../provisioning/types.js";
import { discoverCanvas, type CanvasDiscovery } from "../canvas/discovery.js";
import type { ActorBinding } from "../canvas/bindings.js";
import type { WorkflowDefinitionV2 } from "../workflow/schema.js";
import { validateWorkflow } from "../workflow/validator.js";
import { persistWorkflow, enqueueWork, startRun, pauseRun, resumeRun, cancelRun, rebindRunActor, listRuns as listRunRows, runEvents } from "../runner/lifecycle.js";
import { TokenRepository } from "../persistence/repositories.js";
import { DatabaseContext } from "../persistence/db.js";
import { getDatabasePath } from "../config/paths.js";
import { reduceConfigureState, type ConfigureState } from "./state.js";
import { uiText } from "./i18n.js";

type ScreenId = "connect" | "provisioning" | "canvas" | "bindings" | "workflow" | "review" | "run";
type ProvisioningInput = { workspace: string; provisioner: ProvisionerBinding; brief: string };
type TuiAction = (input?: ProvisioningInput) => void | Promise<unknown>;
export type RunTokenView = { flowId: string; nodeId: string; status: string };
export type RunEventView = { type: string; data?: string };
export type RunSnapshot = { id: string; status: string; tokens: RunTokenView[]; events?: RunEventView[] };
type TuiActions = Partial<Record<"provisioning" | "canvas", TuiAction>> & {
  connect?: (config: WireConfig) => void | Promise<void>;
  confirmProposal?: (proposal: ProvisioningProposal) => void | Promise<void>;
  discardProposal?: () => void | Promise<void>;
  listWorkspaces?: () => Promise<{ id: string; name: string }[]>;
  selectWorkspace?: (workspaceId: string) => Promise<CanvasActionResult>;
  validateWorkflow?: (workflow: WorkflowDefinitionV2) => unknown[] | Promise<unknown[]>;
  persistWorkflow?: (workflow: WorkflowDefinitionV2) => unknown | Promise<unknown>;
  enqueueWork?: (input: { workflow: WorkflowDefinitionV2; title: string }) => unknown | Promise<unknown>;
  startRun?: (input: { workflow: WorkflowDefinitionV2; workItemId: string }) => unknown | Promise<unknown>;
  pauseRun?: (runId: string) => unknown | Promise<unknown>;
  resumeRun?: (runId: string) => unknown | Promise<unknown>;
  cancelRun?: (runId: string) => unknown | Promise<unknown>;
  rebindRunActor?: (input: { runId: string; actorKey: string; nodeId: string }) => unknown | Promise<unknown>;
  listRuns?: () => RunSnapshot[] | Promise<RunSnapshot[]>;
};
type CanvasActionResult = { discovery: CanvasDiscovery; workspace: string };
type ProvisioningActionResult = { refreshedCanvas: CanvasDiscovery; stagedProposal: ProvisioningProposal | null };
type FormField = "code" | "host" | "port" | "serverKeyHash" | "token";
type FormValues = Record<FormField, string>;
type TextInput = { kind: "actorKey"; nodeId: string } | { kind: "taskActor" } | { kind: "outcome"; nodeKey: string };
const formFields: FormField[] = ["code", "serverKeyHash"];

function normalizeSpki(value: string): string {
  const compact = value.trim().replace(/:/g, "");
  if (/^[\da-f]{64}$/i.test(compact)) return Buffer.from(compact, "hex").toString("base64");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact) && Buffer.from(compact, "base64").length === 32) return compact;
  throw new Error("SPKI SHA-256 must be 32-byte hex or Base64");
}

function initialForm(config?: WireConfig): FormValues {
  return { code: config?.code ?? "", host: config?.host ?? "localhost", port: String(config?.port ?? 7434), serverKeyHash: config?.serverKeyHash ?? "", token: config?.token ?? "" };
}

function issueText(issue: unknown): string {
  if (typeof issue === "string") return issue;
  if (typeof issue === "object" && issue !== null && "message" in issue) return String(issue.message);
  return String(issue);
}

function issueSeverity(issue: unknown): string | undefined {
  if (typeof issue === "object" && issue !== null && "severity" in issue) return String(issue.severity);
  return undefined;
}

function mainNodes(draft: WorkflowDefinitionV2 | undefined) {
  return Object.entries(draft?.flows.main?.nodes ?? {});
}

function lastTaskKey(draft: WorkflowDefinitionV2 | undefined): string | undefined {
  const tasks = mainNodes(draft).filter(([, node]) => node.type === "task");
  return tasks.at(-1)?.[0];
}

export function App({ initial, onQuit, language = resolveLanguage(), actions, wireConfig, configPath }: { initial?: ConfigureState; onQuit?: () => void; language?: Language; actions?: TuiActions; wireConfig?: WireConfig; configPath?: string }) {
  const text = uiText(language);
  const screens = text.screens;
  const [state, setState] = useState<ConfigureState>(initial ?? { screen: "connect", actorBindings: {}, validation: [], connection: "idle" });
  const [briefForm, setBriefForm] = useState<string>();
  const [briefBuffer, setBriefBuffer] = useState("");
  const [textInput, setTextInput] = useState<TextInput>();
  const [textBuffer, setTextBuffer] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [connectionReady, setConnectionReady] = useState(false);
  const [storedConfig, setStoredConfig] = useState(wireConfig);
  const [form, setForm] = useState<FormValues>();
  const [fieldIndex, setFieldIndex] = useState(0);
  const [buffer, setBuffer] = useState("");
  const [pickerChoices, setPickerChoices] = useState<{ id: string; name: string }[]>();
  const [choicesFor, setChoicesFor] = useState<ScreenId>();
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [rebindTarget, setRebindTarget] = useState<{ runId: string; actorKey: string }>();
  const [runs, setRuns] = useState<RunSnapshot[]>([]);
  const closeChoices = () => { setPickerChoices(undefined); setChoicesFor(undefined); };
  const openChoices = (choices: { id: string; name: string }[], forScreen: ScreenId) => { setPickerChoices(choices); setChoicesFor(forScreen); setChoiceIndex(0); setFeedback(undefined); };
  const openWorkspaceChoices = async (forScreen: ScreenId) => {
    if (!actions?.listWorkspaces) { setFeedback(text.blocked[forScreen] ?? text.disabled); return; }
    try {
      const choices = await actions.listWorkspaces();
      if (!choices.length) { setFeedback(text.blocked[forScreen] ?? text.disabled); return; }
      openChoices(choices, forScreen);
    } catch (error) { setFeedback(`${text.error}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const go = (index: number) => setState(s => reduceConfigureState(s, { type: "SCREEN", screen: screens[Math.max(0, Math.min(screens.length - 1, index))][0] }));
  const openForm = () => { const next = initialForm(storedConfig); setForm(next); setFieldIndex(0); setBuffer(next[formFields[0]]); setFeedback(undefined); setConnectionReady(false); };
  const reportError = (error: unknown) => setFeedback(`${text.error}: ${error instanceof Error ? error.message : String(error)}`);
  useEffect(() => {
    if (state.screen !== "run" || !actions?.listRuns) return;
    let alive = true;
    const tick = () => {
      void Promise.resolve(actions.listRuns!()).then(result => { if (alive) setRuns(result); }).catch(error => { if (alive) reportError(error); });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [state.screen, actions?.listRuns]);
  const commitField = async () => {
    if (!form) return;
    const field = formFields[fieldIndex];
    const value = buffer.trim();
    if (field === "code" && !/^\d{6}$/.test(value)) return setFeedback(`${text.invalid}: ${text.fieldLabels.code}`);
    const next = { ...form, [field]: value };
    if (field === "code") { setForm(next); setFieldIndex(1); setBuffer(next.serverKeyHash); setFeedback(undefined); return; }
    if (field === "serverKeyHash") {
      try {
        const normalized = normalizeSpki(value);
        const normalizedForm = { ...form, [field]: normalized };
        setForm(normalizedForm);
        setBuffer(normalized);
        const config: WireConfig = { host: normalizedForm.host, port: Number(normalizedForm.port), code: normalizedForm.code, serverKeyHash: normalized, ...(normalizedForm.token ? { token: normalizedForm.token } : {}) };
        try {
          setState(s => ({ ...s, connection: "loading", error: undefined }));
          if (!actions?.connect) throw new Error(text.blocked.connect);
          await actions.connect(config);
          setStoredConfig(config);
          setForm(undefined);
          setConnectionReady(true);
          setState(s => ({ ...s, connection: "connected", error: undefined }));
          setFeedback(text.feedback.connect);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setState(s => ({ ...s, connection: "error", error: message }));
          setFeedback(`${text.error}: ${message}`);
        }
      } catch (error) {
        setFeedback(`${text.invalid}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
  };
  const commitTextInput = () => {
    const value = textBuffer.trim();
    if (textInput?.kind === "actorKey") {
      const terminal = state.discovery?.terminals.find(t => t.nodeId === textInput.nodeId);
      if (!terminal || !value) { setFeedback(text.invalid); return; }
      const binding: ActorBinding = { key: value, label: value, nodeId: terminal.nodeId, snapshot: { terminalName: terminal.name, roleName: terminal.roleName, agentType: terminal.agentType } };
      setState(s => reduceConfigureState(s, { type: "BIND_ACTOR", binding }));
      setTextInput(undefined); setTextBuffer("");
      setFeedback(text.feedback.bindActor);
      return;
    }
    if (textInput?.kind === "taskActor") {
      if (!value) { setFeedback(text.invalid); return; }
      const key = `task${mainNodes(state.draftWorkflow).length + 1}`;
      setState(s => reduceConfigureState(s, { type: "DRAFT_TASK", key, actor: value }));
      setTextInput(undefined); setTextBuffer("");
      return;
    }
    if (textInput?.kind === "outcome") {
      const [outcome, target] = value.split(/\s+/);
      if (!outcome || !target) { setFeedback(`${text.invalid}: ${text.outcomePrompt}`); return; }
      setState(s => reduceConfigureState(s, { type: "DRAFT_OUTCOME", key: textInput.nodeKey, outcome, target }));
      setTextInput(undefined); setTextBuffer("");
      return;
    }
  };
  const pick = (choice: { id: string; name: string }) => {
    if (choicesFor === "bindings") {
      closeChoices();
      setTextInput({ kind: "actorKey", nodeId: choice.id });
      setTextBuffer("");
      return;
    }
    if (choicesFor === "run" && rebindTarget) {
      const rebind = actions?.rebindRunActor;
      const target = rebindTarget;
      closeChoices();
      setRebindTarget(undefined);
      if (!rebind) { setFeedback(text.disabled); return; }
      void Promise.resolve(rebind({ runId: target.runId, actorKey: target.actorKey, nodeId: choice.id })).then(() => setFeedback(text.feedback.rebindRun)).catch(reportError);
      return;
    }
    const select = actions?.selectWorkspace;
    if (!select) { setFeedback(text.blocked[state.screen] ?? text.disabled); return; }
    closeChoices();
    void Promise.resolve(select(choice.id)).then(result => {
      setState(s => ({ ...s, workspace: result.workspace, discovery: result.discovery }));
      if (state.screen === "provisioning") { setBriefForm(""); setBriefBuffer(""); }
      setFeedback(undefined);
    }).catch(reportError);
  };
  const runRunAction = (action: ((runId: string) => unknown) | undefined, runId: string, feedbackKey: string) => {
    if (!action) { setFeedback(text.disabled); return; }
    void Promise.resolve(action(runId)).then(() => setFeedback(text.feedback[feedbackKey])).catch(reportError);
  };
  useInput((input, key) => {
    if (key.escape) {
      if (form) { setForm(undefined); setFeedback(text.cancelled); }
      else if (textInput) { setTextInput(undefined); setTextBuffer(""); setFeedback(text.cancelled); }
      else if (state.screen === "provisioning" && briefForm !== undefined) { setBriefForm(undefined); setBriefBuffer(""); setFeedback(text.cancelled); }
      else if (pickerChoices && choicesFor === state.screen) { closeChoices(); setRebindTarget(undefined); setFeedback(text.cancelled); }
      else if (state.screen === "review" && state.draftWorkflow) { setFeedback(text.cancelled); }
      else if (state.screen === "review" && proposal) { const discard = actions?.discardProposal; if (discard) void Promise.resolve(discard()).catch(reportError); setState(s => ({ ...s, screen: "provisioning", stagedProvisioningProposal: undefined })); setFeedback(text.cancelled); }
      else onQuit?.();
      return;
    }
    if (input === "q") { onQuit?.(); if (!onQuit) process.exitCode = 0; return; }
    if (form) { if (key.tab) { const nextIndex = (fieldIndex + 1) % formFields.length; setFieldIndex(nextIndex); setBuffer(form[formFields[nextIndex]]); return; } if (key.return) { void commitField(); return; } if (key.backspace || key.delete) { setBuffer(value => value.slice(0, -1)); return; } if (input) setBuffer(value => value + input); return; }
    if (textInput) { if (key.return) { commitTextInput(); return; } if (key.backspace || key.delete) { setTextBuffer(value => value.slice(0, -1)); return; } if (input) setTextBuffer(value => value + input); return; }
    if (state.screen === "provisioning" && briefForm !== undefined) { if (key.escape) { setBriefForm(undefined); setBriefBuffer(""); return; } if (key.return) { const provisioner = state.discovery ? listProvisioners(state.discovery)[0] : undefined; if (!state.workspace || !provisioner || !briefBuffer.trim()) { setFeedback("Provisioning requires workspace, live Maestro provisioner, and brief"); return; } const action = actions?.provisioning; if (!action) { setFeedback(text.blocked.provisioning ?? text.disabled); return; } setBriefForm(undefined); void Promise.resolve(action({ workspace: state.workspace, provisioner: { nodeId: provisioner.nodeId, snapshot: provisioner }, brief: briefBuffer.trim() })).then(value => { if (value && typeof value === "object" && "refreshedCanvas" in value) { const result = value as ProvisioningActionResult; setState(s => ({ ...s, discovery: result.refreshedCanvas, stagedProvisioningProposal: result.stagedProposal, screen: result.stagedProposal ? "review" : "provisioning" })); } }).catch(reportError); return; } if (key.backspace || key.delete) { setBriefBuffer(value => value.slice(0, -1)); return; } if (input) setBriefBuffer(value => value + input); return; }
    if (pickerChoices && choicesFor === state.screen) {
      if (key.upArrow || input === "k") { setChoiceIndex(index => Math.max(0, index - 1)); return; }
      if (key.downArrow || input === "j") { setChoiceIndex(index => Math.min(pickerChoices.length - 1, index + 1)); return; }
      const pickNumber = Number(input);
      if (Number.isInteger(pickNumber) && pickNumber >= 1 && pickNumber <= pickerChoices.length) { pick(pickerChoices[pickNumber - 1]); return; }
      if (key.return) { const choice = pickerChoices[choiceIndex]; if (!choice) return; pick(choice); return; }
      return;
    }
    if (state.screen === "workflow") {
      if (input === "t") { setTextInput({ kind: "taskActor" }); setTextBuffer(""); setFeedback(undefined); return; }
      if (input === "x") { const key2 = `done${mainNodes(state.draftWorkflow).length + 1}`; setState(s => reduceConfigureState(s, { type: "DRAFT_TERMINAL", key: key2 })); return; }
      if (input === "o") { const nodeKey = lastTaskKey(state.draftWorkflow); if (!nodeKey) { setFeedback(text.blocked.workflow); return; } setTextInput({ kind: "outcome", nodeKey }); setTextBuffer(""); return; }
    }
    if (state.screen === "run") {
      const paused = runs.find(r => r.status === "paused");
      const running = runs.find(r => r.status === "running");
      if (input === "p" && running) { runRunAction(actions?.pauseRun, running.id, "pauseRun"); return; }
      if (paused) {
        if (input === "r") { runRunAction(actions?.resumeRun, paused.id, "resumeRun"); return; }
        if (input === "c") { runRunAction(actions?.cancelRun, paused.id, "cancelRun"); return; }
        if (input === "a") {
          // token.nodeId is a workflow graph key; resolve the actor from the flow node, never from canvas node ids.
          const token = paused.tokens.find(t => t.status !== "completed" && t.status !== "cancelled") ?? paused.tokens[0];
          const node = state.draftWorkflow?.flows[token?.flowId ?? "main"]?.nodes[token?.nodeId ?? ""];
          const actorKey = node?.type === "task" ? node.actor : undefined;
          if (!actorKey || !state.discovery?.terminals.length) { setFeedback(text.blocked.rebindRun); return; }
          setRebindTarget({ runId: paused.id, actorKey });
          openChoices(state.discovery.terminals.map(t => ({ id: t.nodeId, name: `${t.name} (${t.nodeId})` })), "run");
          return;
        }
      }
    }
    if (input === "d") return go(screens.findIndex(x => x[0] === "canvas"));
    const number = Number(input); if (number >= 1 && number <= screens.length) return go(number - 1);
    if (key.return) {
      const screen = state.screen as ScreenId;
      if (screen === "connect") { if (connectionReady) { go(screens.findIndex(x => x[0] === "provisioning")); } else openForm(); return; }
      if (screen === "provisioning" && briefForm === undefined) { if (!state.workspace) { void openWorkspaceChoices(screen); return; } if (!state.discovery || !listProvisioners(state.discovery).length) { setFeedback(text.blocked.provisioning ?? text.disabled); return; } setBriefForm(""); setBriefBuffer(""); setFeedback(undefined); return; }
      if (screen === "review" && state.draftWorkflow) {
        const draft = state.draftWorkflow;
        const validate = actions?.validateWorkflow;
        const persist = actions?.persistWorkflow;
        if (!validate || !persist) { setFeedback(text.blocked.review); return; }
        setState(s => ({ ...s, connection: "loading", error: undefined }));
        void Promise.resolve(validate(draft)).then(issues => {
          setState(s => reduceConfigureState(s, { type: "VALIDATION", issues }));
          // persistWorkflow rejects only severity=error; warnings are shown but must not block saving.
          const errors = issues.filter(issue => issueSeverity(issue) === "error");
          if (errors.length) { setState(s => ({ ...s, connection: "connected", error: undefined })); setFeedback(text.reviewIssues(errors.length)); return undefined; }
          return Promise.resolve(persist(draft)).then(() => { setState(s => ({ ...s, connection: "connected", error: undefined })); setFeedback(text.feedback.workflowSaved); });
        }).catch(error => {
          const message = error instanceof Error ? error.message : String(error);
          setState(s => ({ ...s, connection: "error", error: message }));
          setFeedback(`${text.error}: ${message}`);
        });
        return;
      }
      if (screen === "review" && proposal) {
        const action = actions?.confirmProposal;
        if (!action) { setFeedback("Persistência da fila indisponível; proposta não aplicada"); return; }
        setState(s => ({ ...s, connection: "loading", error: undefined }));
        void Promise.resolve(action(proposal)).then(() => { setState(s => ({ ...s, connection: "connected", stagedProvisioningProposal: undefined, screen: "provisioning", error: undefined })); setFeedback("Proposta aplicada na fila"); }).catch(error => { setState(s => ({ ...s, connection: "error", error: error instanceof Error ? error.message : String(error) })); setFeedback(`${text.error}: ${error instanceof Error ? error.message : String(error)}`); });
        return;
      }
      if (screen === "canvas") { if (!state.workspace) { void openWorkspaceChoices(screen); return; } const select = actions?.selectWorkspace; if (!select) { setFeedback(text.blocked.canvas ?? text.disabled); return; } void Promise.resolve(select(state.workspace)).then(result => { setState(s => ({ ...s, discovery: result.discovery, workspace: result.workspace })); setFeedback(text.feedback.canvas); }).catch(reportError); return; }
      if (screen === "bindings") { if (!state.discovery?.terminals.length) { setFeedback(text.blocked.bindings); return; } openChoices(state.discovery.terminals.map(t => ({ id: t.nodeId, name: `${t.name} (${t.nodeId})` })), "bindings"); return; }
      if (screen === "run") {
        const draft = state.draftWorkflow;
        const enqueue = actions?.enqueueWork;
        const start = actions?.startRun;
        if (!draft || !enqueue || !start) { setFeedback(text.blocked.run); return; }
        void Promise.resolve(enqueue({ workflow: draft, title: draft.name })).then(workItemId => Promise.resolve(start({ workflow: draft, workItemId: String(workItemId) }))).then(() => setFeedback(text.feedback.startRun)).catch(reportError);
        return;
      }
      const action = actions?.[screen as "provisioning" | "canvas"];
      if (!action) { setFeedback(text.blocked[screen] ?? text.disabled); return; }
      try { const result = action(); if (result instanceof Promise) void result.then(() => { setFeedback(text.feedback[screen]); }).catch(reportError); else setFeedback(text.feedback[screen]); } catch (error) { reportError(error); }
      return;
    }
    const delta = key.rightArrow || input === "n" ? 1 : key.leftArrow || input === "b" ? -1 : 0; if (delta) go(screens.findIndex(x => x[0] === state.screen) + delta);
  });
  const title = text.title[state.screen] ?? text.title.connect;
  const connection = text.connection[state.connection ?? "idle"];
  const proposal = state.stagedProvisioningProposal as ProvisioningProposal | undefined;
  const genericAction = state.screen === "provisioning" || state.screen === "canvas" ? actions?.[state.screen] : undefined;
  const ready = state.screen === "connect" ? !form
    : state.screen === "bindings" ? Boolean(state.discovery?.terminals.length)
    : state.screen === "workflow" ? true
    : state.screen === "review" ? Boolean(proposal || (state.draftWorkflow && actions?.validateWorkflow && actions?.persistWorkflow))
    : state.screen === "run" ? Boolean(actions?.listRuns)
    : Boolean(genericAction);
  const body = state.screen === "review" && proposal && !state.draftWorkflow ? `Staged proposal: ${proposal.workItems.map(item => `${item.key}: ${item.title}`).join(" | ")}. Enter confirms; Esc rejects.` : text.body[state.screen] ?? text.body.connect;
  const activeField = form ? formFields[fieldIndex] : undefined;
  const fieldValue = (field: FormField) => field === activeField ? buffer : form?.[field] ?? "";
  const masked = (field: FormField, value: string) => field === "token" ? "•".repeat(value.length) : value;
  const inputPrompt = textInput ? textInput.kind === "actorKey" ? text.actorPrompt : textInput.kind === "taskActor" ? text.taskActorPrompt : text.outcomePrompt : undefined;
  const inputLabel = textInput ? textInput.kind === "actorKey" ? text.inputLabels.actor : textInput.kind === "taskActor" ? text.inputLabels.taskActor : text.inputLabels.outcome : undefined;
  const draftNodes = state.screen === "workflow" ? mainNodes(state.draftWorkflow) : [];
  return (
    <Box flexDirection="column" width={88}>
      <Box borderStyle="round" borderColor={connection === text.connection.error ? "red" : "cyan"} paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">MAESTRI FLOW</Text>
        <Text>{connection} · {state.workspace ?? text.workspace} / {state.floor ?? text.floor}</Text>
      </Box>
      <Box marginTop={1}>
        <Box flexDirection="column" width={20} marginRight={1}>
          <Text bold color="gray">{text.screensLabel}</Text>
          {screens.map(([id, label], i) => <Text key={id} color={id === state.screen ? "cyan" : undefined}>{id === state.screen ? "› " : "  "}{i + 1}. {label}</Text>)}
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor={state.error || feedback?.startsWith(text.error) ? "red" : "gray"} paddingX={2} flexGrow={1}>
          {form ? (
            <>
              <Text bold>{text.configureWire}</Text>
              {formFields.map(field => <Text key={field} color={field === activeField ? "cyan" : undefined}>{field === activeField ? "› " : "  "}{text.fieldLabels[field]}: {masked(field, fieldValue(field)) || "_"}</Text>)}
            </>
          ) : pickerChoices && choicesFor === state.screen ? (
            <>
              <Text bold>{title}</Text>
              <Text color="cyan">{choicesFor === "bindings" || choicesFor === "run" ? text.terminalPickerPrompt : text.workspacePrompt}</Text>
              {pickerChoices.map((choice, index) => <Text key={choice.id} color={index === choiceIndex ? "cyan" : undefined}>{index === choiceIndex ? "› " : "  "}{choice.name}</Text>)}
            </>
          ) : (
            <>
              <Text bold>{title}</Text>
              <Text>{body}</Text>
              {inputPrompt && <Text color="cyan">{inputPrompt}</Text>}
              {state.connection === "loading" && <Text color="yellow">{text.loading}</Text>}
              {state.error && <Text color="red">{text.error}: {state.error}</Text>}
              {!state.error && state.connection !== "loading" && state.screen === "canvas" && !state.discovery && <Text color="gray">{text.emptyCanvas}</Text>}
              {state.screen === "canvas" && state.discovery && state.discovery.terminals.map(terminal => <Text key={terminal.nodeId}>{terminal.name} ({terminal.nodeId})</Text>)}
              {state.screen === "bindings" && <Text color="gray">{text.bindings(Object.keys(state.actorBindings).length)}</Text>}
              {state.screen === "bindings" && Object.entries(state.actorBindings).map(([bindingKey, b]) => <Text key={bindingKey}>{bindingKey} → {b.nodeId}</Text>)}
              {state.screen === "workflow" && <Text color="gray">{text.workflowHints}</Text>}
              {draftNodes.map(([nodeKey, node]) => <Text key={nodeKey}>{nodeKey}: {node.type === "task" ? `task[${node.actor}]${Object.entries(node.outcomes).map(([outcome, target]) => ` ${outcome}→${target}`).join("")}` : node.type === "terminal" ? `terminal[${node.status}]` : node.type}</Text>)}
              {state.screen === "review" && state.validation.map((issue, index) => <Text key={index} color={issueSeverity(issue) === "error" ? "red" : "yellow"}>- {issueText(issue)}</Text>)}
              {state.screen === "review" && <Text color={state.validation.length ? "yellow" : "green"}>{state.validation.length ? text.reviewIssues(state.validation.length) : text.reviewReady}</Text>}
              {state.screen === "run" && (runs.length ? runs.map(run => (
                <Box key={run.id} flexDirection="column">
                  <Text bold>{run.id}: {run.status}</Text>
                  <Text>{text.runTokens}: {run.tokens.map(t => `${t.nodeId}/${t.status}`).join(" · ") || "—"}</Text>
                  {run.events?.filter(event => event.type === "TASK_RESULT").map((event, index) => <Text key={index} color="cyan">{text.runEvents}: TASK_RESULT {event.data ?? ""}</Text>)}
                </Box>
              )) : <Text color="gray">{text.runEmpty}</Text>)}
              {state.screen === "run" && runs.some(run => run.status === "paused") && <Text color="yellow">{text.pausedHint}</Text>}
              <Text color={ready ? "green" : "gray"}>{state.screen === "connect" ? (connectionReady ? text.advanceHint : text.actionHint.connect) : text.actionHint[state.screen] ?? ""} · {ready ? "READY" : text.disabled}</Text>
            </>
          )}
          {feedback && <Text color={Object.values(text.blocked).includes(feedback) || feedback.startsWith(text.invalid) || feedback.startsWith(text.error) ? "red" : "green"}>{feedback}</Text>}
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">{form ? text.formHelp : briefForm !== undefined ? `Brief: ${briefBuffer || "_"} · Enter envia · Esc cancela` : textInput ? `${inputLabel}: ${textBuffer || "_"} · ${text.inputHint}` : text.shortcuts}</Text>
      </Box>
    </Box>
  );
}
export async function runConfigureTui(options: { language?: Language; configPath?: string } = {}) {
  const language = options.language ?? resolveLanguage();
  if (!process.stdin.isTTY) { process.stdout.write(`${uiText(language).nonInteractive}\n`); return; }
  const wireConfig = await loadWireConfig(options.configPath);
  let client: WireClient | undefined;
  const connect = async (config: WireConfig) => { const credentials = await new WireClient(null, undefined, { host: config.host ?? "localhost", port: config.port ?? 7434, serverKeyHash: config.serverKeyHash ?? "", serverCertificate: config.serverCertificate }).pair(config); client = new WireClient(credentials); await saveCredentials(credentials); await saveWireConfig({ ...config, ...credentials }, options.configPath); };
  const listWorkspaces = async () => { if (!client) throw new Error("Conecte ao Wire antes de escolher o workspace"); return await client.listWorkspaces(); };
  const selectWorkspace = async (workspaceId: string): Promise<CanvasActionResult> => { if (!client) throw new Error("Conecte ao Wire antes de escolher o workspace"); return { workspace: workspaceId, discovery: discoverCanvas(await client.getFeed(workspaceId)) }; };
  const provisioning = async (input?: ProvisioningInput): Promise<ProvisioningActionResult> => {
    const authenticated = client;
    if (!authenticated) throw new Error("Conecte ao Wire antes de provisionar");
    if (!input?.workspace || !input.provisioner || !input.brief.trim()) throw new Error("Provisionamento depende de workspace, provisioner e brief");
    const discovery = discoverCanvas(await authenticated.getFeed(input.workspace));
    const result = await runProvisioning({ discovery, provisioner: input.provisioner, brief: input.brief, getFeed: () => authenticated.getFeed(input.workspace), sendPrompt: (terminalId, text) => authenticated.sendPrompt(terminalId, text) });
    return result;
  };
  const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workflow";
  const runDb = new DatabaseContext(getDatabasePath());
  const listRuns = async (): Promise<RunSnapshot[]> => {
    const tokens = new TokenRepository(runDb);
    return listRunRows().map(run => ({
      id: run.id,
      status: run.status,
      // better-sqlite3 returns raw column rows; repository layer is untyped by design.
      tokens: tokens.byRun(run.id).map((raw: unknown) => { const t = raw as { flow_id: string; node_id: string; status: string }; return { flowId: t.flow_id, nodeId: t.node_id, status: t.status }; }),
      events: runEvents(run.id).filter(event => event.type === "TASK_RESULT").map(event => ({ type: event.type, data: event.data })),
    }));
  };
  return render(<App language={language} wireConfig={wireConfig} configPath={options.configPath} actions={{
    connect,
    listWorkspaces,
    selectWorkspace,
    provisioning,
    validateWorkflow,
    persistWorkflow,
    enqueueWork: input => { const ids = enqueueWork(slug(input.workflow.name), [{ title: input.title }]); if (!ids.length) throw new Error("work item not created"); return ids[0]; },
    startRun: input => startRun(slug(input.workflow.name), input.workflow, { workItemId: input.workItemId }),
    pauseRun,
    resumeRun,
    cancelRun,
    rebindRunActor: input => rebindRunActor(input.runId, input.actorKey, input.nodeId),
    listRuns,
  }} />);
}
