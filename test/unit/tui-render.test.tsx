import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../../src/tui/app.js";

describe("configure TUI shell", () => {
  it("renders connection, sidebar, main panel and shortcuts", () => {
    const view = render(<App onQuit={() => undefined} />);
    expect(view.lastFrame()).toContain("MAESTRI FLOW"); expect(view.lastFrame()).toContain("SCREENS"); expect(view.lastFrame()).toContain("Connect to Wire"); expect(view.lastFrame()).toContain("1–6 jump");
  });
  it("navigates with keyboard and renders empty state", async () => {
    const view = render(<App onQuit={() => undefined} />);
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
    const view = render(<App initial={{ screen: "canvas", actorBindings: {}, validation: [], connection: "loading", error: "feed unavailable" }} onQuit={() => undefined} />); expect(view.lastFrame()).toContain("Loading live state"); expect(view.lastFrame()).toContain("feed unavailable");
  });
});
