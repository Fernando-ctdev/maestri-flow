import React, { useState } from "react";
import { Box, Text, render, useInput } from "ink";
import { reduceConfigureState, type ConfigureState } from "./state.js";

const screens = [["connect", "Connect"], ["provisioning", "Provision"], ["canvas", "Canvas"], ["bindings", "Actors"], ["workflow", "Workflow"], ["review", "Review"]] as const;
const copy: Record<string, [string, string]> = {
  connect: ["Connect to Wire", "Pair Full control and choose a workspace."], provisioning: ["Provisioning", "Use the existing canvas or stage a Maestro handoff."],
  canvas: ["Live canvas", "Review terminals and connections from the authoritative feed."], bindings: ["Actor bindings", "Bind logical actors to stable canvas node IDs."],
  workflow: ["Workflow builder", "Define nodes, outcomes, branches and terminal states."], review: ["Review & save", "Resolve errors before saving the confirmed workflow."],
};
export function App({ initial, onQuit }: { initial?: ConfigureState; onQuit?: () => void }) {
  const [state, setState] = useState<ConfigureState>(initial ?? { screen: "connect", actorBindings: {}, validation: [], connection: "idle" });
  const go = (index: number) => setState(s => reduceConfigureState(s, { type: "SCREEN", screen: screens[Math.max(0, Math.min(screens.length - 1, index))][0] }));
  useInput((input, key) => { if (input === "q" || key.escape) { onQuit?.(); if (!onQuit) process.exitCode = 0; return; } const number = Number(input); if (number >= 1 && number <= screens.length) return go(number - 1); const delta = key.rightArrow || input === "n" ? 1 : key.leftArrow || input === "b" ? -1 : 0; if (delta) go(screens.findIndex(x => x[0] === state.screen) + delta); });
  const [title, body] = copy[state.screen] ?? copy.connect;
  const connection = state.connection === "connected" ? "CONNECTED" : state.connection === "loading" ? "CONNECTING" : state.connection === "error" ? "ERROR" : "OFFLINE";
  return <Box flexDirection="column" width={88}><Box borderStyle="round" borderColor={connection === "ERROR" ? "red" : "cyan"} paddingX={1} justifyContent="space-between"><Text bold color="cyan">MAESTRI FLOW</Text><Text>{connection} · {state.workspace ?? "No workspace"} / {state.floor ?? "ground"}</Text></Box><Box marginTop={1}><Box flexDirection="column" width={20} marginRight={1}><Text bold color="gray">SCREENS</Text>{screens.map(([id, label], i) => <Text key={id} color={id === state.screen ? "cyan" : undefined}>{id === state.screen ? "› " : "  "}{i + 1}. {label}</Text>)}</Box><Box flexDirection="column" borderStyle="round" borderColor={state.error ? "red" : "gray"} paddingX={2} flexGrow={1}><Text bold>{title}</Text><Text>{body}</Text>{state.connection === "loading" && <Text color="yellow">Loading live state…</Text>}{state.error && <Text color="red">Error: {state.error}</Text>}{!state.error && state.connection !== "loading" && state.screen === "canvas" && !state.discovery && <Text color="gray">No canvas snapshot yet.</Text>}{state.screen === "bindings" && <Text color="gray">{Object.keys(state.actorBindings).length} binding(s)</Text>}{state.screen === "review" && <Text color={state.validation.length ? "yellow" : "green"}>{state.validation.length ? `${state.validation.length} issue(s)` : "Ready to save"}</Text>}</Box></Box><Box marginTop={1}><Text color="gray">←/→ n/b navigate · 1–6 jump · q quit</Text></Box></Box>;
}
export function runConfigureTui() { if (!process.stdin.isTTY) { process.stdout.write("maestri-flow configure (non-interactive; use a TTY for navigation)\n"); return; } return render(<App />); }
