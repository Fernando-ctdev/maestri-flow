import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWireConfig, saveWireConfig } from "../../src/config/wire.js";
import { createCli } from "../../src/cli/index.js";

describe("Wire configuration", () => {
  it("persists and reloads endpoint and pairing fields", async () => {
    const directory = mkdtempSync(join(tmpdir(), "maestri-flow-wire-"));
    try {
      const configPath = join(directory, "config.json");
      await saveWireConfig({ host: "wire.example", port: 7434, code: "123456", serverKeyHash: "pin", token: "token" }, configPath);
      await expect(loadWireConfig(configPath)).resolves.toEqual({ host: "wire.example", port: 7434, code: "123456", serverKeyHash: "pin", token: "token" });
      expect(JSON.parse(readFileSync(configPath, "utf8")).wire.host).toBe("wire.example");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("configures Wire through non-interactive CLI flags", async () => {
    const directory = mkdtempSync(join(tmpdir(), "maestri-flow-cli-wire-"));
    try {
      const output: string[] = [];
      const cli = createCli({ configPath: join(directory, "config.json"), write: value => output.push(value) });
      await cli.parseAsync(["node", "maestri-flow", "configure", "--host", "wire.example", "--port", "7434", "--code", "123456", "--server-key-hash", "pin"], { from: "node" });
      expect(output).toEqual(["Configuração do Wire salva; conexão pendente."]);
      await expect(loadWireConfig(join(directory, "config.json"))).resolves.toMatchObject({ host: "wire.example", code: "123456" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
