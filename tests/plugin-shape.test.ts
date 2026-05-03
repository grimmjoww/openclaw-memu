/**
 * RED-phase test: assert the plugin's public shape.
 *
 * Following memory-lancedb's smoke-test pattern. Verifies the default export
 * is a properly-formed `definePluginEntry(...)` result with:
 *   - id === "openclaw-memu"
 *   - kind === "memory"
 *   - register() function present
 *   - description non-empty
 *
 * This test fails until src/index.ts exists with the right shape.
 */

import { describe, test, expect } from "vitest";

describe("@grimmjoww/openclaw-memu — plugin shape", () => {
  test("default export has the expected definePluginEntry shape", async () => {
    const mod = await import("../src/index.js");
    const plugin = mod.default;

    expect(plugin).toBeDefined();
    expect(plugin.id).toBe("openclaw-memu");
    expect(plugin.kind).toBe("memory");
    expect(typeof plugin.name).toBe("string");
    expect(plugin.name.length).toBeGreaterThan(0);
    expect(typeof plugin.description).toBe("string");
    expect(plugin.description.length).toBeGreaterThan(0);
    expect(typeof plugin.register).toBe("function");
  });

  test("manifest matches plugin defaults", async () => {
    const manifest = await import("../openclaw.plugin.json", { with: { type: "json" } });
    expect(manifest.default.id).toBe("openclaw-memu");
    expect(manifest.default.kind).toBe("memory");
    expect(manifest.default.configSchema.required).toContain("serverUrl");
    expect(manifest.default.configSchema.required).toContain("userId");
  });
});
