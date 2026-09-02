# @grimmjoww/openclaw-memu

**Status: Active development. Not yet published to npm or ClawHub.**

This plugin gives OpenClaw persistent memory through [memU-server](https://github.com/NevaMind-AI/memU). It recalls relevant context before an agent turn, captures the completed exchange afterward, and exposes memory operations through tools and a CLI.

## Problem This Solves

An agent can have a capable model and still feel forgetful between sessions. The missing layer is often not another prompt—it is a dependable lifecycle around memory:

- retrieve context at the right time
- scope it to the correct user and agent
- inject it without breaking the prompt flow
- capture useful exchanges after the turn
- fail cleanly when the memory service is offline
- give users direct tools to inspect, store, or remove memory

`openclaw-memu` connects those pieces without placing memory behavior inside the model’s voluntary decision-making.

## What It Provides

- **Automatic recall** through OpenClaw’s `before_prompt_build` hook
- **Automatic capture** through the `agent_end` hook
- **Tools:** `memu_recall`, `memu_store`, and `memu_forget`
- **CLI:** `openclaw memu list/search/stats/clear`
- **Configuration schema** through `openclaw.plugin.json`
- **Typed memU client and trigger logic** under `src/`

## Design

```text
OpenClaw Gateway
      │
      ├── before_prompt_build ──▶ recall relevant memory
      │                              │
      │                              ▼
      │                         memU-server
      │                              │
      └── agent_end ───────────▶ capture exchange

User / agent tools ────────────▶ recall, store, forget
CLI commands ──────────────────▶ list, search, stats, clear
```

The plugin communicates with memU-server over HTTP. A typical backend can use PostgreSQL with VectorChord for storage and vector search, Ollama for embeddings, and a configured chat model for memory extraction.

The implementation is split into focused modules:

- `src/index.ts` — OpenClaw plugin registration, hooks, tools, configuration, and CLI surface
- `src/memu-client.ts` — memU-server HTTP client
- `src/triggers.ts` — rules that decide when automatic capture should occur

## Verification Status

The repository includes Vitest coverage for:

- memU client behavior
- plugin shape and registration expectations
- capture-trigger decisions

Available development checks:

```bash
npm test
npm run lint
npm run build
```

Those tests are evidence for the behaviors they cover; they are not a claim that every OpenClaw or memU deployment has been validated.

## Current Limitations

- The package has not been published to npm or ClawHub.
- Compatibility currently targets the OpenClaw plugin API declared in `package.json`.
- A running memU-server is required.
- Network availability and the configured memory backend affect recall and capture behavior.
- Installation and operational guidance are still being refined while the integration is under active development.

## Install During Development

Until the package is published, install it from a local checkout:

```cmd
openclaw plugins install file:<path-to-openclaw-memu>
```

Once a release is published, the intended package command is:

```cmd
openclaw plugins install @grimmjoww/openclaw-memu
```

## Configure

Add an entry to `openclaw.json`:

```json5
{
  plugins: {
    entries: {
      "openclaw-memu": {
        enabled: true,
        config: {
          serverUrl: "http://localhost:8000",
          userId: "your-user-id",
          agentId: "work-agent",
          autoRecall: true,
          autoCapture: true
        }
      }
    }
  }
}
```

See `openclaw.plugin.json` for the complete configuration schema supported by the current branch.

## My Role and Workflow

I directed the integration from behavior design through implementation review and testing. That included defining the recall and capture lifecycle, separating the HTTP client from plugin registration and trigger logic, specifying user and agent scoping, reviewing repository changes, testing failure paths, and correcting the design when OpenClaw’s actual SDK surface differed from early assumptions.

The project was built through an AI-assisted engineering workflow with human control over requirements, architecture, diffs, tests, and observed behavior.

## Provenance and License

This repository integrates OpenClaw and memU; their code and licenses remain with their respective maintainers.

The integration code in this repository is licensed under MIT.
