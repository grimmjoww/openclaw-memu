# OpenClaw + memU Memory Plugin

**A TypeScript memory plugin that connects OpenClaw's 5.x capability API to a memU server.**

This project gives OpenClaw a second memory source backed by memU. It can retrieve relevant memories before a turn, expose memU through OpenClaw's corpus-search surface, register explicit memory tools, provide gateway RPC methods, and add memory commands to the OpenClaw CLI.

It is also still an unfinished integration. The current source includes the capture logic used by `memu_store` and `memu.memorize`, but it does **not** register an automatic post-turn capture callback in the OpenClaw 5.x host. Automatic recall is wired; automatic capture is not yet wired. That distinction matters, so it is stated plainly here.

## Current capabilities

### Automatic recall

The plugin registers a memory prompt supplement. Before a turn, OpenClaw can send the current query to memU and inject the returned memories into the prompt context.

Recall can be configured by:

- User and agent scope
- RAG or LLM retrieval method
- Top-K result count
- Maximum query length
- Request timeout

Empty queries and empty result sets return no supplement rather than adding noise to the prompt.

### Memory corpus integration

The plugin registers `search` and `get` primitives through OpenClaw's memory corpus supplement API. This allows memU results to participate alongside other memory sources exposed by the host.

memU does not currently expose a direct get-by-item-ID endpoint through this client, so `get` is implemented as a single-result retrieval using the supplied lookup text.

### Explicit agent tools

| Tool | Behavior |
|---|---|
| `memu_recall` | Retrieve memories for a query within the configured user and agent scope |
| `memu_store` | Store one explicit memory through the same trimming and capture filters used by the shared capture helper |
| `memu_forget` | Clear the entire configured memory scope |

`memu_forget` is destructive. The current tool clears the full `(userId, agentId)` bucket because the client does not expose per-item deletion.

### Gateway methods

| Method | Scope | Purpose |
|---|---|---|
| `memu.retrieve` | read | Query scoped memory |
| `memu.memorize` | write | Store supplied messages through the capture helper |
| `memu.clear` | write | Clear the configured scope |

Gateway errors are returned through the host's response envelope instead of being thrown across the plugin boundary.

### CLI

The plugin registers:

```text
openclaw memu search <query...>
openclaw memu stats
openclaw memu clear --yes
```

The clear command requires `--yes`. The current source does not implement a `list` subcommand.

## What remains unfinished

The original implementation targeted older lifecycle hooks such as `before_prompt_build` and `agent_end`. OpenClaw 5.x moved memory plugins to capability registration. The repository has already pivoted its recall and tool surfaces to that API, but an equivalent automatic post-turn capture registration is not present in the current `register()` body.

As a result:

- `autoRecall=true` enables automatic pre-turn retrieval.
- `memu_store` and `memu.memorize` can capture memory explicitly.
- `autoCapture` is retained in the configuration shape for the planned completion of the feature.
- Merely setting `autoCapture=true` does not currently create an automatic after-turn callback.

See [`SDK_PIVOT_NOTES.md`](./SDK_PIVOT_NOTES.md) for the history of the 5.x migration and the remaining live-gateway verification work.

## Architecture

```text
                                 ┌──────────────────────────────┐
OpenClaw turn ── prompt query ──▶│ memory prompt supplement     │
                                 │ + corpus search/get          │
                                 └──────────────┬───────────────┘
                                                │ HTTP
                                                ▼
                                         memU-server
                                                │
                                      scoped by userId/agentId

Agent or operator
   ├─ memu_recall / memu_store / memu_forget
   ├─ memu.retrieve / memu.memorize / memu.clear
   └─ openclaw memu search / stats / clear
```

The plugin does not import OpenClaw at runtime. The OpenClaw gateway loads the plugin and supplies the registration API, while the repository keeps the plugin object hand-shaped so its structure can be tested without installing the peer dependency in the unit-test environment.

## Repository layout

| Path | Responsibility |
|---|---|
| [`src/index.ts`](./src/index.ts) | Plugin entry, configuration resolution, host registrations, tools, gateway methods, and CLI |
| [`src/memu-client.ts`](./src/memu-client.ts) | HTTP client for memU retrieval, memorization, and clearing |
| [`src/triggers.ts`](./src/triggers.ts) | Capture filters, category detection, prompt escaping, and memory-context formatting |
| [`openclaw.plugin.json`](./openclaw.plugin.json) | Plugin manifest, configuration schema, and UI hints |
| [`tests/`](./tests) | Vitest coverage for the client, plugin shape, and trigger behavior |
| [`SDK_PIVOT_NOTES.md`](./SDK_PIVOT_NOTES.md) | Migration notes from the earlier hook model to the OpenClaw 5.x capability API |

## Requirements

- Node.js environment compatible with the configured TypeScript toolchain
- OpenClaw `>=2026.5.2`
- A reachable memU server
- TypeScript 5.9-compatible build environment

## Install from source

This package is not presented as published to npm or ClawHub. Build and install it from a local checkout:

```bash
git clone https://github.com/grimmjoww/openclaw-memu.git
cd openclaw-memu
npm install
npm run build
openclaw plugins install file:.
```

Confirm the plugin with your OpenClaw installation's plugin-listing command and watch the gateway logs while exercising recall and explicit store operations.

## Configure

Add an entry to the OpenClaw plugin configuration:

```json5
{
  plugins: {
    entries: {
      "openclaw-memu": {
        enabled: true,
        config: {
          serverUrl: "http://localhost:8000",
          userId: "your-user-id",
          agentId: "optional-agent-scope",
          autoRecall: true,
          autoCapture: false,
          recallTopK: 3,
          retrieveMethod: "rag"
        }
      }
    }
  }
}
```

`serverUrl` and `userId` are required. Use separate `agentId` values when distinct runtimes should not write into the same memory pool.

`autoCapture` is shown as `false` in this example because automatic post-turn capture is not wired in the current source. Explicit storing remains available through the tool and gateway method.

## Build and test

```bash
npm install
npm run lint
npm test
npm run build
```

The committed tests cover:

- memU HTTP-client request and response behavior
- Plugin export and registration shape
- Capture filtering and maximum-length behavior
- Category detection
- Prompt-injection escaping and memory-context formatting

The GitHub connector used for this documentation pass cannot execute the local Node.js suite, so no current passing-test count is claimed here.

## Status

**Version 0.1.0 — active development.**

Implemented now: automatic recall, corpus retrieval, explicit tools, gateway methods, CLI commands, scoped configuration, capture helpers, and unit-test files.

Still needed before presenting this as a finished memory plugin: wire and verify automatic post-turn capture through the current OpenClaw host API, run the full build and test suite in the target environment, install it into a live gateway, and verify the user-facing workflow end to end.

## Related work

- [Claude Code + memU](https://github.com/grimmjoww/claude-code-memu) — MCP and lifecycle-hook memory integration for Claude Code
- [Hindsight Installer MCP](https://github.com/grimmjoww/hindsight-installer-mcp) — safe memory-pipeline migrations and rollback
- [Phantom Horizon Studios](https://github.com/grimmjoww/phantom-horizons-studios) — related agent-systems portfolio

## License

MIT.
