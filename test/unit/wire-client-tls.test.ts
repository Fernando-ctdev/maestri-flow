import { createServer } from "node:https";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import selfsigned from "selfsigned";
import { WireClient } from "../../src/wire/client.js";
import { spkiSha256 } from "../../src/wire/tls-pin.js";

async function withWireServer(test: (port: number, pin: string) => Promise<void>) {
  const certificate = selfsigned.generate([{ name: "commonName", value: "localhost" }], { days: 1 });
  const server = createServer({ key: certificate.private, cert: certificate.cert }, (request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(request.url === "/api/info" ? { protocolVersion: 1, capabilities: ["feedSnapshots", "canvasMirroring", "terminalStreaming"] } : { role: "owner", token: "token", deviceId: "device" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try { await test((server.address() as { port: number }).port, spkiSha256(certificate.cert)); } finally { server.close(); await once(server, "close"); }
}

describe("Wire bootstrap TLS pinning", () => {
  it("pairs with the peer's matching SPKI pin", async () => {
    await withWireServer(async (port, pin) => {
      await expect(new WireClient(null).pair({ host: "127.0.0.1", port, code: "123456", serverKeyHash: pin })).resolves.toMatchObject({ token: "token", serverKeyHash: pin });
    });
  });

  it("rejects a mismatched SPKI pin", async () => {
    await withWireServer(async (port) => {
      await expect(new WireClient(null).pair({ host: "127.0.0.1", port, code: "123456", serverKeyHash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" })).rejects.toThrow("Wire SPKI pin mismatch");
    });
  });
});
