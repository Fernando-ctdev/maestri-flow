import { describe, expect, it } from "vitest";
import { getConfigDir, getDataDir, getDatabasePath, getWorkflowDir } from "../../src/config/paths.js";

describe("configuration paths", () => {
  it("keeps data areas under the explicit home", () => {
    const env = { MAESTRI_FLOW_HOME: "/tmp/mf" };
    expect(getConfigDir(env)).toBe("/tmp/mf");
    expect(getDataDir(env)).toBe("/tmp/mf");
    expect(getWorkflowDir(env)).toBe("/tmp/mf/workflows");
    expect(getDatabasePath(env)).toBe("/tmp/mf/state.db");
  });
});
