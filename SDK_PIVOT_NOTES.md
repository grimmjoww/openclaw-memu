# OpenClaw Plugin SDK Pivot — Block 4.3 Notes

**Date:** 2026-05-03
**Status:** Pivot identified, helpers confirmed reusable, ready for register-body implementation next session.

## What changed

Original Block 4 plan (per `Desktop/rei-opus-archive/plans/2026-05-02-openclaw-memu-plugin-spec.md`) referenced the `memory-lancedb` plugin as the reference implementation, with hooks named `before_prompt_build`, `agent_end`, `session_end`.

**Reality (verified via Serena search across `node_modules/openclaw/dist/extensions/`):**
- `memory-lancedb` is GONE from OpenClaw 5.x — replaced by `memory-core` + `memory-wiki`
- The hook names `before_prompt_build` / `agent_end` / `session_end` are not in the 5.x `OpenClawPluginApi`
- The new pattern uses **capability registration** rather than lifecycle hooks

## Canonical 5.x plugin shape

```ts
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "openclaw-memu",
  name: "OpenClaw memU Memory",
  description: "...",
  configSchema: memuPluginConfigSchema,
  register(api) {
    const config = resolveConfig(api.pluginConfig);

    // Auto-recall (replaces before_prompt_build):
    api.registerMemoryPromptSupplement(builder);

    // Memory corpus search (LLM-callable):
    api.registerMemoryCorpusSupplement({ search, get });

    // Capture / memorize / forget RPC endpoints:
    api.registerGatewayMethod("memu.memorize", handler, { scope: WRITE_SCOPE });
    api.registerGatewayMethod("memu.retrieve", handler, { scope: READ_SCOPE });
    api.registerGatewayMethod("memu.clear",    handler, { scope: WRITE_SCOPE });

    // Explicit LLM tools (memu_recall/store/forget):
    api.registerTool(createMemuRecallTool(config), { name: "memu_recall" });
    api.registerTool(createMemuStoreTool(config),  { name: "memu_store" });
    api.registerTool(createMemuForgetTool(config), { name: "memu_forget" });

    // CLI integration:
    api.registerCli(({ program, config: appConfig }) => {
      registerMemuCli(program, config, appConfig);
    }, { descriptors: [{ name: "memu", description: "...", hasSubcommands: true }] });
  },
});
```

## Reference plugin to mirror

`node_modules/openclaw/dist/extensions/memory-wiki/index.js` lines 953-987 — full canonical example.

## What stays from current code

- `src/triggers.ts` (verbatim port from old memory-lancedb) — 100% reusable. The triggers (auto-capture detection, prompt-injection patterns, escapeMemoryForPrompt, formatRelevantMemoriesContext, shouldCapture, detectCategory) are SDK-agnostic helpers.
- `src/memu-client.ts` — 100% reusable. HTTP client over memU-server's `/api/v3/memory/*` endpoints.
- `tests/memu-client.test.ts` (4 tests) — still valid.
- `tests/triggers.test.ts` (24 tests) — still valid.

## What needs to change

- `src/index.ts` — full rewrite to use `definePluginEntry({...})` from `openclaw/plugin-sdk/plugin-entry` with a real register-body
- `tests/plugin-shape.test.ts` (2 tests) — update to assert the new shape (existence of `default` export with `register: (api) => void`, plus `id` / `name` / `description`)
- `package.json` — ensure `openclaw` peer dependency is declared (so the import resolves)

## New files to create

- `src/config.ts` — typed config resolution (mirror `resolveMemoryWikiConfig` shape)
- `src/tools/memu-recall.ts`, `src/tools/memu-store.ts`, `src/tools/memu-forget.ts` — TypeBox-typed LLM tools
- `src/prompt-supplement.ts` — `createMemuPromptSectionBuilder(config)` — used by `registerMemoryPromptSupplement`
- `src/corpus-supplement.ts` — `createMemuCorpusSupplement({config, appConfig})` — used by `registerMemoryCorpusSupplement`
- `src/gateway.ts` — `registerMemuGatewayMethods(...)` — wraps memU-client calls in respond/respondError pattern
- `src/cli.ts` — `registerMemuCli(program, config, appConfig)` — list/search/stats/clear subcommands

## Test strategy for the register body (TDD)

For each new tool/method, write a failing test that asserts:
1. The plugin's register function calls the right `api.register*` method with the right name
2. The handler delegates to the corresponding MemUClient method with the right args
3. Errors get formatted via the standard error envelope

Use a fake/mock `OpenClawPluginApi` to capture register calls — test that the SHAPE is right, leave end-to-end verification for the live OpenClaw install.

## Block 4.4 (after 4.3 lands)

- `npm run build`
- `openclaw plugins install file:G:\projects\openclaw-memu`
- Restart gateway visibly
- Verify `openclaw plugins list` shows it
- Send Discord test message → verify auto-recall + auto-capture fire (watch gateway log for `[plugins] [openclaw-memu] ...`)

## Continuation note for next session

To resume:
1. Read this file
2. `cd G:\projects\openclaw-memu` and verify `npm test` is still 30/30 green (helpers untouched)
3. Open openclaw-memu in PyCharm (so JetBrains-AST tools work for this project)
4. Start by writing the failing test for the new plugin-shape (TDD RED)
5. Walk through the file list above in order: config.ts → prompt-supplement.ts → corpus-supplement.ts → gateway.ts → tools/ → cli.ts → finally update index.ts
