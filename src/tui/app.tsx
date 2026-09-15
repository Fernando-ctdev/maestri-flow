import React, { useState } from "react";
import { render, Text, Box, useInput } from "ink";
import { reduceConfigureState, type ConfigureState } from "./state.js";
const screens = ["connect", "provisioning", "canvas", "bindings", "workflow", "review"];
export function App({ initial }: { initial?: ConfigureState }) {
  const [state, setState] = useState<ConfigureState>(initial ?? { screen: screens[0], actorBindings: {}, validation: [] });
  useInput((input, key) => { if (input === "q" || key.escape) { process.exitCode = 0; return; } if (key.rightArrow || input === "n") setState(s => reduceConfigureState(s, { type: "SCREEN", screen: screens[Math.min(screens.indexOf(s.screen) + 1, screens.length - 1)] })); if (key.leftArrow || input === "b") setState(s => reduceConfigureState(s, { type: "SCREEN", screen: screens[Math.max(screens.indexOf(s.screen) - 1, 0)] })); });
  return <Box flexDirection="column"><Text>maestri-flow configure</Text><Text>Screen: {state.screen}</Text><Text>n/right next · b/left back · q quit</Text><Text>{state.screen === "connect" ? "Connect or pair with Wire." : state.screen === "provisioning" ? "Select existing canvas or stage provisioning." : state.screen === "canvas" ? "Review live terminal canvas." : state.screen === "bindings" ? "Bind actors by canvas nodeId." : state.screen === "workflow" ? "Author workflow nodes and outcomes." : "Review and save configuration."}</Text></Box>;
}
export function runConfigureTui() { if (!process.stdin.isTTY) { process.stdout.write("maestri-flow configure (non-interactive; use a TTY for navigation)\n"); return; } return render(<App />); }
