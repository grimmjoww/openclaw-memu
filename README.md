# @grimmjoww/openclaw-memu

OpenClaw memory plugin backed by [memU-server](https://github.com/NevaMind-AI/memU). Provides:

- **Auto-recall** before each agent turn — injects relevant memories via the `before_prompt_build` hook
- **Auto-capture** after each turn — memorizes the just-completed exchange via the `agent_end` hook
- **Tools**: `memu_recall`, `memu_store`, `memu_forget`
- **CLI**: `openclaw memu list/search/stats/clear`

## Status

🚧 **In active development (Block 4 of the rei-memu-integration umbrella plan)**. Not yet published to npm or ClawHub.

## Why this exists

[memU](https://github.com/NevaMind-AI/memU) gives you persistent, structured-category, multi-modal memory with native proactive `next_step_query` synthesis. OpenClaw gives you the lifecycle hooks (`before_prompt_build`, `agent_end`) and the channel/tool/CLI surfaces. This plugin glues them.

## Architecture

```
OpenClaw Gateway ──[lifecycle hooks]── this plugin ──[HTTP]──▶ memU-server (:8000)
                                                                     │
                                              ┌──────────┬───────────┴───────────┐
                                              ▼          ▼                       ▼
                                          Postgres   Ollama                    MiniMax
                                          + vchord   embeddings                chat extract
```

## Install

```cmd
openclaw plugins install @grimmjoww/openclaw-memu
```

(Once published. Pre-publish: `openclaw plugins install file:G:\projects\openclaw-memu`.)

## Configure

Add to `openclaw.json`:

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

See `openclaw.plugin.json` for the full configSchema.

## License

MIT.
