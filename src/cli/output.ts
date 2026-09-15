export function render(value: unknown, json = false): string {
  return typeof value === "object" && value !== null || json ? JSON.stringify(value, null, 2) : String(value);
}
