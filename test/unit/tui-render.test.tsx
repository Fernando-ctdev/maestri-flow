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
});
