# @grimmjoww/openclaw-memu

> Persistent memU-backed memory for OpenClaw through lifecycle hooks, agent tools, and a CLI surface.

`openclaw-memu` connects an OpenClaw runtime to [memU](https://github.com/NevaMind-AI/memU) so relevant memories can be recalled before a turn and new interaction context can be captured after the agent finishes.

## Current status

🚧 **Active development. Not published to npm or ClawHub.**

This repository is suitable as inspectable implementation work and a development testbed. It should not yet be treated as a polished, supported package.

## What it provides

- **Automatic recall** through the `before_prompt_build` lifecycle hook
- **Automatic capture** through the `agent_end` lifecycle hook
- **Agent tools:** `memu_recall`, `memu_store`, and `memu_forget`
- **CLI commands:** `openclaw memu list`, `search`, `stats`, and `clear`
- **Configuration schema** through `openclaw.plugin.json`
- **Tests** for the plugin behavior and integration boundaries

## Architecture

```text
OpenClaw Gateway
      │
      ├── before_prompt_build ──▶ recall relevant memory
      ├── agent_end ────────────▶ capture completed interaction
      ├── tools / CLI ──────────▶ explicit memory operations
      │
      ▼
openclaw-memu plugin ──HTTP──▶ memU-server
                                  │
                     ┌────────────┼────────────┐
                     ▼            ▼            ▼
                 Postgres       Ollama      chat model
                 + vchord      embeddings   extraction
```

## Why this design

A memory integration needs more than a `search_memory` tool. The useful path is automatic but bounded:

- recall happens before the prompt is assembled, so the model receives context when it can still use it;
- capture happens after the turn, so the memory service sees the completed exchange;
- explicit tools and CLI commands remain available for inspection and correction;
- user and agent identifiers can scope memory instead of collapsing every runtime into one pool.

## Local installation

Until the package is published, install from a local checkout:

```cmd
openclaw plugins install file:G:\projects\openclaw-memu
```

Example configuration:

```json5
{
  plugins: {
    entries: {
      "openclaw-memu": {
        enabled: true,
        config: {
          serverUrl: "http://localhost:8000",
          userId: "willie",
          autoRecall: true,
          autoCapture: true
        }
      }
    }
  }
}
```

See `openclaw.plugin.json` for the authoritative configuration schema.

## Verification surface

The repository includes TypeScript source, package metadata, a plugin manifest, SDK pivot notes, and tests. Before publication, the remaining release work should include a clean install test against the targeted OpenClaw SDK version, documented test output, package-name verification, and a release checklist.

## Portfolio notes

This project demonstrates:

- lifecycle-hook integration with an agent runtime;
- automatic and explicit memory operations;
- separation of plugin, server, vector store, embedding, and extraction responsibilities;
- schema-driven configuration;
- honest status communication for an unfinished integration.

The project is directed by **Willie Stewart / Phantom Horizon Studios** through an AI-assisted engineering workflow involving architecture decisions, implementation direction, repository review, testing requirements, and failure-driven iteration.

## License

MIT.
