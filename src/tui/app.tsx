import React, { useState } from "react";
import { Box, Text, render, useInput } from "ink";
import { resolveLanguage, type Language } from "../config/language.js";
import { loadWireConfig, saveWireConfig, type WireConfig } from "../config/wire.js";
import { saveCredentials } from "../config/credentials.js";
import { WireClient } from "../wire/client.js";
import { discoverCanvas, type CanvasDiscovery } from "../canvas/discovery.js";
import { reduceConfigureState, type ConfigureState } from "./state.js";
import { uiText } from "./i18n.js";

type ScreenId = "connect" | "provisioning" | "canvas" | "bindings" | "workflow" | "review";
type TuiAction = () => void | Promise<unknown>;
type TuiActions = Partial<Record<Exclude<ScreenId, "connect">, TuiAction>> & { connect?: (config: WireConfig) => void | Promise<void> };
type CanvasActionResult = { discovery: CanvasDiscovery; workspace: string };
type FormField = "code" | "host" | "port" | "serverKeyHash" | "token";
type FormValues = Record<FormField, string>;
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

export function App({ initial, onQuit, language = resolveLanguage(), actions, wireConfig, configPath }: { initial?: ConfigureState; onQuit?: () => void; language?: Language; actions?: TuiActions; wireConfig?: WireConfig; configPath?: string }) {
  const text = uiText(language);
  const screens = text.screens;
  const [state, setState] = useState<ConfigureState>(initial ?? { screen: "connect", actorBindings: {}, validation: [], connection: "idle" });
  const [feedback, setFeedback] = useState<string>();
  const [connectionReady, setConnectionReady] = useState(false);
  const [storedConfig, setStoredConfig] = useState(wireConfig);
  const [form, setForm] = useState<FormValues>();
  const [fieldIndex, setFieldIndex] = useState(0);
  const [buffer, setBuffer] = useState("");
  const go = (index: number) => setState(s => reduceConfigureState(s, { type: "SCREEN", screen: screens[Math.max(0, Math.min(screens.length - 1, index))][0] }));
  const openForm = () => { const next = initialForm(storedConfig); setForm(next); setFieldIndex(0); setBuffer(next[formFields[0]]); setFeedback(undefined); setConnectionReady(false); };
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
  useInput((input, key) => {
    if (key.escape) { if (form) { setForm(undefined); setFeedback(text.cancelled); } else onQuit?.(); return; }
    if (input === "q") { onQuit?.(); if (!onQuit) process.exitCode = 0; return; }
    if (form) { if (key.tab) { const nextIndex = (fieldIndex + 1) % formFields.length; setFieldIndex(nextIndex); setBuffer(form[formFields[nextIndex]]); return; } if (key.return) { void commitField(); return; } if (key.backspace || key.delete) { setBuffer(value => value.slice(0, -1)); return; } if (input) setBuffer(value => value + input); return; }
    if (input === "d") return go(screens.findIndex(x => x[0] === "canvas"));
    const number = Number(input); if (number >= 1 && number <= screens.length) return go(number - 1);
    if (key.return) { const screen = state.screen as ScreenId; if (screen === "connect") { if (connectionReady) { go(screens.findIndex(x => x[0] === "provisioning")); } else openForm(); return; } const action = actions?.[screen]; if (!action) { setFeedback(text.blocked[screen] ?? text.disabled); return; } try { const result = action(); if (result instanceof Promise) void result.then(value => { if (screen === "canvas" && value && typeof value === "object" && "discovery" in value && "workspace" in value) { const canvas = value as CanvasActionResult; setState(s => ({ ...s, discovery: canvas.discovery, workspace: canvas.workspace })); } setFeedback(text.feedback[screen]); }).catch(error => setFeedback(`${text.error}: ${error instanceof Error ? error.message : String(error)}`)); else setFeedback(text.feedback[screen]); } catch (error) { setFeedback(`${text.error}: ${error instanceof Error ? error.message : String(error)}`); } return; }
    const delta = key.rightArrow || input === "n" ? 1 : key.leftArrow || input === "b" ? -1 : 0; if (delta) go(screens.findIndex(x => x[0] === state.screen) + delta);
  });
  const [title, body] = [text.title[state.screen] ?? text.title.connect, text.body[state.screen] ?? text.body.connect];
  const connection = text.connection[state.connection ?? "idle"];
  const action = state.screen === "connect" ? undefined : actions?.[state.screen as Exclude<ScreenId, "connect">];
  const connectAction = state.screen === "connect" && !form;
  const activeField = form ? formFields[fieldIndex] : undefined;
  const fieldValue = (field: FormField) => field === activeField ? buffer : form?.[field] ?? "";
  const masked = (field: FormField, value: string) => field === "token" ? "•".repeat(value.length) : value;
  return <Box flexDirection="column" width={88}><Box borderStyle="round" borderColor={connection === text.connection.error ? "red" : "cyan"} paddingX={1} justifyContent="space-between"><Text bold color="cyan">MAESTRI FLOW</Text><Text>{connection} · {state.workspace ?? text.workspace} / {state.floor ?? text.floor}</Text></Box><Box marginTop={1}><Box flexDirection="column" width={20} marginRight={1}><Text bold color="gray">{text.screensLabel}</Text>{screens.map(([id, label], i) => <Text key={id} color={id === state.screen ? "cyan" : undefined}>{id === state.screen ? "› " : "  "}{i + 1}. {label}</Text>)}</Box><Box flexDirection="column" borderStyle="round" borderColor={state.error || feedback?.startsWith(text.error) ? "red" : "gray"} paddingX={2} flexGrow={1}>{form ? <><Text bold>{text.configureWire}</Text><Text>{text.formHelp}</Text>{formFields.map(field => <Text key={field} color={field === activeField ? "cyan" : undefined}>{field === activeField ? "› " : "  "}{text.fieldLabels[field]}: {masked(field, fieldValue(field)) || "_"}</Text>)}</> : <><Text bold>{title}</Text><Text>{body}</Text>{state.connection === "loading" && <Text color="yellow">{text.loading}</Text>}{state.error && <Text color="red">{text.error}: {state.error}</Text>}{!state.error && state.connection !== "loading" && state.screen === "canvas" && !state.discovery && <Text color="gray">{text.emptyCanvas}</Text>}{state.screen === "canvas" && state.discovery && state.discovery.terminals.map(terminal => <Text key={terminal.nodeId}>{terminal.name} ({terminal.nodeId})</Text>)}{state.screen === "bindings" && <Text color="gray">{text.bindings(Object.keys(state.actorBindings).length)}</Text>}{state.screen === "review" && <Text color={state.validation.length ? "yellow" : "green"}>{state.validation.length ? text.reviewIssues(state.validation.length) : text.reviewReady}</Text>}<Text color={connectAction || action ? "green" : "gray"}>{state.screen === "connect" ? (connectionReady ? text.advanceHint : text.actionHint.connect) : text.actionHint[state.screen] ?? ""} · {connectAction || action ? "READY" : text.disabled}</Text></>}{feedback && <Text color={Object.values(text.blocked).includes(feedback) || feedback.startsWith(text.invalid) || feedback.startsWith(text.error) ? "red" : "green"}>{feedback}</Text>}</Box></Box><Box marginTop={1}><Text color="gray">{form ? text.formHelp : text.shortcuts}</Text></Box></Box>;
}
export async function runConfigureTui(options: { language?: Language; configPath?: string } = {}) { const language = options.language ?? resolveLanguage(); if (!process.stdin.isTTY) { process.stdout.write(`${uiText(language).nonInteractive}\n`); return; } const wireConfig = await loadWireConfig(options.configPath); let client: WireClient | undefined; const connect = async (config: WireConfig) => { const credentials = await new WireClient(null, undefined, { host: config.host ?? "localhost", port: config.port ?? 7434, serverKeyHash: config.serverKeyHash ?? "", serverCertificate: config.serverCertificate }).pair(config); client = new WireClient(credentials); await saveCredentials(credentials); await saveWireConfig({ ...config, ...credentials }, options.configPath); }; const canvas = async (): Promise<CanvasActionResult> => { if (!client) throw new Error("Conecte ao Wire antes de atualizar o Canvas"); const workspaces = await client.listWorkspaces(); const workspace = workspaces[0]; if (!workspace) throw new Error("Nenhum workspace disponível no Wire"); return { workspace: workspace.id, discovery: discoverCanvas(await client.getFeed(workspace.id)) }; }; const provisioning = async () => { throw new Error("Provisionamento depende de workspace, provisioner e brief"); }; return render(<App language={language} wireConfig={wireConfig} configPath={options.configPath} actions={{ connect, canvas, provisioning }} />); }
