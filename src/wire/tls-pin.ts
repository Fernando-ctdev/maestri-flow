import { createHash, X509Certificate } from "node:crypto";

export function spkiSha256(certificate: string | Buffer): string {
  const cert = new X509Certificate(certificate);
  return createHash("sha256").update(cert.publicKey.export({ type: "spki", format: "der" })).digest("base64");
}
export function verifySpki(certificate: string | Buffer, expected: string): boolean { return spkiSha256(certificate) === expected; }
