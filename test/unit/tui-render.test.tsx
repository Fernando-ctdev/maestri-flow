import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { App } from "../../src/tui/app.js";
import { resolveLanguage } from "../../src/config/language.js";

describe("configure TUI shell", () => {
  it("renders connection, sidebar, main panel and shortcuts", () => {
    const view = render(<App onQuit={() => undefined} />);
    expect(view.lastFrame()).toContain("MAESTRI FLOW"); expect(view.lastFrame()).toContain("TELAS"); expect(view.lastFrame()).toContain("Conectar ao Wire"); expect(view.lastFrame()).toContain("1–6 ir");
  });
  it("navigates with keyboard and renders empty state", async () => {
    const view = render(<App language="en" onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    view.stdin.write("n");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain("Provisioning");
    view.stdin.write("3");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain("Live canvas");
    expect(view.lastFrame()).toContain("No canvas snapshot yet");
  });
  it("renders loading and error states", () => {
    const view = render(<App language="en" initial={{ screen: "canvas", actorBindings: {}, validation: [], connection: "loading", error: "feed unavailable" }} onQuit={() => undefined} />); expect(view.lastFrame()).toContain("Loading live state"); expect(view.lastFrame()).toContain("Error: feed unavailable");
  });
  it("resolves language by flag, environment, config and default", () => {
    expect(resolveLanguage({ env: {} })).toBe("pt-BR");
    expect(resolveLanguage({ env: { MAESTRI_FLOW_LANGUAGE: "en" } })).toBe("en");
    expect(resolveLanguage({ flag: "en", env: { MAESTRI_FLOW_LANGUAGE: "pt-BR" } })).toBe("en");
    const directory = mkdtempSync(join(tmpdir(), "maestri-flow-i18n-"));
    try {
      const configPath = join(directory, "config.json");
      writeFileSync(configPath, JSON.stringify({ language: "en" }));
      expect(resolveLanguage({ env: {}, configPath })).toBe("en");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each([
    ["provisioning", "Provisionador não configurado"],
    ["canvas", "Feed do canvas não configurado"],
    ["review", "Persistência não configurada"],
  ] as const)("Enter on %s reports a blocked action", async (screen, message) => {
    const view = render(<App initial={{ screen, actorBindings: {}, validation: [] }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain(message);
  });
  it("keeps the connection form open when pairing fails", async () => {
    const view = render(<App language="en" actions={{ connect: async () => { throw new Error("invalid pairing code"); } }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const character of "123456") view.stdin.write(character);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(view.lastFrame()).toContain("SPKI SHA-256");
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(view.lastFrame()).toContain("Invalid value: SPKI SHA-256 must be 32-byte hex or Base64");
    const securityKey = "00".repeat(32);
    view.stdin.write(securityKey);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(view.lastFrame()).toContain("Configure Wire");
    expect(view.lastFrame()).toContain("Error: invalid pairing code");
  });
  it("normalizes pasted hexadecimal SPKI before pairing", async () => {
    let pairedConfig: { serverKeyHash?: string } | undefined;
    const view = render(<App language="en" actions={{ connect: async config => { pairedConfig = config; } }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const character of "123456") view.stdin.write(character);
    await new Promise((resolve) => setTimeout(resolve, 80));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    const securityKey = "00".repeat(32);
    view.stdin.write(securityKey);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pairedConfig?.serverKeyHash).toBe(Buffer.from(securityKey, "hex").toString("base64"));
    expect(view.lastFrame()).toContain("CONNECTED");
  });
  it("passes a pasted 32-byte Base64 SPKI unchanged to pairing", async () => {
    let pairedConfig: { serverKeyHash?: string } | undefined;
    const pin = Buffer.alloc(32, 1).toString("base64");
    const view = render(<App language="en" actions={{ connect: async config => { pairedConfig = config; } }} onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const character of "123456") view.stdin.write(character);
    await new Promise((resolve) => setTimeout(resolve, 80));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 80));
    view.stdin.write(pin);
    await new Promise((resolve) => setTimeout(resolve, 20));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pairedConfig?.serverKeyHash).toBe(pin);
    expect(view.lastFrame()).toContain("CONNECTED");
  });
  it("renders an actionable connection entry in English", () => {
    const view = render(<App language="en" initial={{ screen: "connect", actorBindings: {}, validation: [], connection: "idle" }} onQuit={() => undefined} />);
    expect(view.lastFrame()).toContain("READY");
    expect(view.lastFrame()).toContain("Press Enter to test the connection");
  });
  it("Enter on Connect opens the Wire configuration form", async () => {
    const view = render(<App language="en" onQuit={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    view.stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.lastFrame()).toContain("Configure Wire");
    expect(view.lastFrame()).toContain("Pairing code");
    expect(view.lastFrame()).toContain("SPKI SHA-256");
    expect(view.lastFrame()).not.toContain("DISABLED");
  });
});
