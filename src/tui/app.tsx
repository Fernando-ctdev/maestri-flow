import React, { useState } from "react";
import { Box, Text, render, useInput } from "ink";
import { resolveLanguage, type Language } from "../config/language.js";
import { reduceConfigureState, type ConfigureState } from "./state.js";
import { uiText } from "./i18n.js";

type ScreenId = "connect" | "provisioning" | "canvas" | "bindings" | "workflow" | "review";
type TuiActions = Partial<Record<ScreenId, () => void | Promise<void>>>;

export function App({ initial, onQuit, language = resolveLanguage(), actions }: { initial?: ConfigureState; onQuit?: () => void; language?: Language; actions?: TuiActions }) {
  const text = uiText(language);
  const screens = text.screens;
  const [state, setState] = useState<ConfigureState>(initial ?? { screen: "connect", actorBindings: {}, validation: [], connection: "idle" });
  const [feedback, setFeedback] = useState<string>();
  const go = (index: number) => setState(s => reduceConfigureState(s, { type: "SCREEN", screen: screens[Math.max(0, Math.min(screens.length - 1, index))][0] }));
  useInput((input, key) => { if (input === "q" || key.escape) { onQuit?.(); if (!onQuit) process.exitCode = 0; return; } if (input === "d") return go(screens.findIndex(x => x[0] === "canvas")); const number = Number(input); if (number >= 1 && number <= screens.length) return go(number - 1); if (key.return) { const screen = state.screen as ScreenId; const action = actions?.[screen]; if (!action) { setFeedback(text.blocked[screen] ?? text.disabled); return; } try { const result = action(); if (result instanceof Promise) void result.then(() => setFeedback(text.feedback[screen])).catch(error => setFeedback(`${text.error}: ${error instanceof Error ? error.message : String(error)}`)); else setFeedback(text.feedback[screen]); } catch (error) { setFeedback(`${text.error}: ${error instanceof Error ? error.message : String(error)}`); } return; } const delta = key.rightArrow || input === "n" ? 1 : key.leftArrow || input === "b" ? -1 : 0; if (delta) go(screens.findIndex(x => x[0] === state.screen) + delta); });
  const [title, body] = [text.title[state.screen] ?? text.title.connect, text.body[state.screen] ?? text.body.connect];
  const connection = text.connection[state.connection ?? "idle"];
  const action = actions?.[state.screen as ScreenId];
  return <Box flexDirection="column" width={88}><Box borderStyle="round" borderColor={connection === text.connection.error ? "red" : "cyan"} paddingX={1} justifyContent="space-between"><Text bold color="cyan">MAESTRI FLOW</Text><Text>{connection} · {state.workspace ?? text.workspace} / {state.floor ?? text.floor}</Text></Box><Box marginTop={1}><Box flexDirection="column" width={20} marginRight={1}><Text bold color="gray">{text.screensLabel}</Text>{screens.map(([id, label], i) => <Text key={id} color={id === state.screen ? "cyan" : undefined}>{id === state.screen ? "› " : "  "}{i + 1}. {label}</Text>)}</Box><Box flexDirection="column" borderStyle="round" borderColor={state.error ? "red" : "gray"} paddingX={2} flexGrow={1}><Text bold>{title}</Text><Text>{body}</Text>{state.connection === "loading" && <Text color="yellow">{text.loading}</Text>}{state.error && <Text color="red">{text.error}: {state.error}</Text>}{!state.error && state.connection !== "loading" && state.screen === "canvas" && !state.discovery && <Text color="gray">{text.emptyCanvas}</Text>}{state.screen === "bindings" && <Text color="gray">{text.bindings(Object.keys(state.actorBindings).length)}</Text>}{state.screen === "review" && <Text color={state.validation.length ? "yellow" : "green"}>{state.validation.length ? text.reviewIssues(state.validation.length) : text.reviewReady}</Text>}<Text color={action ? "green" : "gray"}>{text.actionHint[state.screen] ?? ""} · {action ? "READY" : text.disabled}</Text>{feedback && <Text color={feedback.startsWith(text.error) || Object.values(text.blocked).includes(feedback) ? "red" : "green"}>{feedback}</Text>}</Box></Box><Box marginTop={1}><Text color="gray">{text.shortcuts}</Text></Box></Box>;
}
export function runConfigureTui(options: { language?: Language } = {}) { const language = options.language ?? resolveLanguage(); if (!process.stdin.isTTY) { process.stdout.write(`${uiText(language).nonInteractive}\n`); return; } return render(<App language={language} />); }
