/**
 * @grimmjoww/openclaw-memu — main plugin entry.
 *
 * Wires memU-server-backed memory into OpenClaw via the 5.x plugin SDK.
 *
 * SDK shape (per `node_modules/openclaw/dist/plugin-sdk/plugin-entry.d.ts`):
 *   - `definePluginEntry({ id, name, description, configSchema, register })`
 *   - `register(api: OpenClawPluginApi)` — capability-registration model
 *
 * Capabilities wired here:
 *   - `api.registerMemoryPromptSupplement(builder)` — auto-recall (replaces 4.x `before_prompt_build`)
 *   - `api.registerMemoryCorpusSupplement({ search, get })` — LLM-callable memory queries
 *   - `api.registerGatewayMethod("memu.memorize" | "memu.retrieve" | "memu.clear", ...)` — RPC endpoints
 *   - `api.registerTool(memu_recall | memu_store | memu_forget)` — explicit LLM tools
 *   - `api.registerCli(...)` — `openclaw memu` subcommands
 *
 * The peer dep (`openclaw`) is NOT imported at runtime here — `register` is
 * invoked by the host gateway, which provides the typed `api`. Local tests
 * exercise the shape only; end-to-end behavior is verified via plugin install
 * against a live gateway in Block 4.4.
 */

import { MemUClient, type MemUMessage } from "./memu-client.js";
import {
  formatRelevantMemoriesContext,
  shouldCapture,
  detectCategory,
  DEFAULT_CAPTURE_MAX_CHARS,
} from "./triggers.js";

// ----- Public config types -----

export type MemUPluginConfig = {
  serverUrl: string;
  userId: string;
  agentId?: string;
  autoRecall?: boolean;
  autoCapture?: boolean;
  recallTopK?: number;
  recallMaxChars?: number;
  captureMaxChars?: number;
  recallTimeoutMs?: number;
  captureMaxMessagesPerTurn?: number;
  retrieveMethod?: "rag" | "llm";
};

type ResolvedMemUConfig = Required<
  Omit<MemUPluginConfig, "agentId">
> & {
  agentId: string;
};

const DEFAULTS: Omit<ResolvedMemUConfig, "serverUrl" | "userId" | "agentId"> = {
  autoRecall: true,
  autoCapture: true,
  recallTopK: 3,
  recallMaxChars: 1000,
  captureMaxChars: DEFAULT_CAPTURE_MAX_CHARS,
  recallTimeoutMs: 15_000,
  captureMaxMessagesPerTurn: 3,
  retrieveMethod: "rag",
};

function resolveConfig(raw: unknown): ResolvedMemUConfig {
  const cfg = (raw ?? {}) as Partial<MemUPluginConfig>;
  if (!cfg.serverUrl) throw new Error("openclaw-memu: serverUrl is required");
  if (!cfg.userId) throw new Error("openclaw-memu: userId is required");
  return {
    serverUrl: cfg.serverUrl,
    userId: cfg.userId,
    agentId: cfg.agentId ?? "",
    autoRecall: cfg.autoRecall ?? DEFAULTS.autoRecall,
    autoCapture: cfg.autoCapture ?? DEFAULTS.autoCapture,
    recallTopK: cfg.recallTopK ?? DEFAULTS.recallTopK,
    recallMaxChars: cfg.recallMaxChars ?? DEFAULTS.recallMaxChars,
    captureMaxChars: cfg.captureMaxChars ?? DEFAULTS.captureMaxChars,
    recallTimeoutMs: cfg.recallTimeoutMs ?? DEFAULTS.recallTimeoutMs,
    captureMaxMessagesPerTurn:
      cfg.captureMaxMessagesPerTurn ?? DEFAULTS.captureMaxMessagesPerTurn,
    retrieveMethod: cfg.retrieveMethod ?? DEFAULTS.retrieveMethod,
  };
}

// ----- Helpers exported for testability (and used by the register-body) -----

/**
 * Build the memory prompt supplement function — invoked by the host before
 * each turn to inject relevant memories as context. Returns null when no
 * usable query/results exist; the host treats null as "no supplement".
 */
export function createMemuPromptSupplement(
  client: MemUClient,
  cfg: ResolvedMemUConfig,
) {
  return async (input: { query?: string; agentSessionKey?: string }) => {
    if (!cfg.autoRecall) return null;
    const query = (input.query ?? "").trim().slice(0, cfg.recallMaxChars);
    if (!query) return null;

    const result = await client.retrieve({
      query,
      userId: cfg.userId,
      agentId: cfg.agentId || undefined,
      method: cfg.retrieveMethod,
      topK: cfg.recallTopK,
    });

    const items = Array.isArray(result.items) ? result.items : [];
    if (items.length === 0) return null;

    const memoryStrings = items
      .map((item) =>
        typeof item === "string"
          ? item
          : typeof (item as { content?: unknown }).content === "string"
            ? ((item as { content: string }).content)
            : JSON.stringify(item),
      )
      .filter((s) => s.length > 0);

    if (memoryStrings.length === 0) return null;
    return formatRelevantMemoriesContext(
      memoryStrings.map((text) => ({ category: detectCategory(text), text })),
    );
  };
}

/**
 * Build the corpus supplement object — gives the host `search` and `get`
 * primitives that LLMs can call (via memory_search / memory_get) to query
 * memU's corpus alongside other memory sources (e.g. memory-wiki).
 */
export function createMemuCorpusSupplement(
  client: MemUClient,
  cfg: ResolvedMemUConfig,
) {
  return {
    search: async (input: { query: string; maxResults?: number }) => {
      const result = await client.retrieve({
        query: input.query,
        userId: cfg.userId,
        agentId: cfg.agentId || undefined,
        method: cfg.retrieveMethod,
        topK: input.maxResults ?? cfg.recallTopK,
      });
      return Array.isArray(result.items) ? result.items : [];
    },
    get: async (input: { lookup: string }) => {
      // memU doesn't expose a get-by-id endpoint; reuse retrieve as a
      // single-item search by exact lookup. Future improvement: add a
      // /api/v3/memory/item/{id} endpoint upstream.
      const result = await client.retrieve({
        query: input.lookup,
        userId: cfg.userId,
        agentId: cfg.agentId || undefined,
        method: cfg.retrieveMethod,
        topK: 1,
      });
      const items = Array.isArray(result.items) ? result.items : [];
      return items[0] ?? null;
    },
  };
}

/**
 * Capture a turn into memU. Used by:
 *   - The post-turn auto-capture path (registered as a gateway hook by
 *     the host runtime when `autoCapture: true`)
 *   - The explicit `memu_store` LLM tool
 */
export async function captureMessages(
  client: MemUClient,
  cfg: ResolvedMemUConfig,
  messages: MemUMessage[],
): Promise<void> {
  if (!cfg.autoCapture) return;
  const trimmed = messages
    .slice(-cfg.captureMaxMessagesPerTurn)
    .filter((m) => shouldCapture(m.content.text))
    .map((m) => ({
      ...m,
      content: { text: m.content.text.slice(0, cfg.captureMaxChars) },
    }));
  if (trimmed.length === 0) return;

  await client.memorize({
    conversation: trimmed,
    userId: cfg.userId,
    agentId: cfg.agentId || undefined,
  });
}

// ----- Plugin entry -----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RegisterApi = any;

/**
 * Plugin object. Compatible with `definePluginEntry({...})` from
 * `openclaw/plugin-sdk/plugin-entry`. We hand-roll the shape here so
 * tests can run without the openclaw peer dep being installed.
 *
 * At install time the host validates the shape against
 * `OpenClawPluginDefinition` (id/kind/name/description/register).
 */
const memuPlugin = {
  id: "openclaw-memu",
  name: "OpenClaw memU Memory",
  description:
    "Always-on memory backed by memU-server. Auto-recall before each turn, auto-capture after each turn, with explicit memu_recall/store/forget tools.",
  kind: "memory" as const,

  register(api: RegisterApi): void {
    const cfg = resolveConfig(api.pluginConfig);
    const client = new MemUClient(cfg.serverUrl);

    // 1) Auto-recall: the host calls this builder before each turn to inject
    //    relevant memU memories into the prompt context.
    api.registerMemoryPromptSupplement(createMemuPromptSupplement(client, cfg));

    // 2) Memory corpus search: lets LLMs query memU alongside other memory
    //    sources (e.g. memory-wiki) via memory_search / memory_get.
    api.registerMemoryCorpusSupplement(createMemuCorpusSupplement(client, cfg));

    // 3) Gateway RPC methods — used by external callers (CLI, tests, web UI).
    api.registerGatewayMethod(
      "memu.memorize",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ params, respond }: { params: any; respond: any }) => {
        try {
          const messages = (params?.messages ?? []) as MemUMessage[];
          await captureMessages(client, cfg, messages);
          respond(true, { ok: true, count: messages.length });
        } catch (error) {
          respond(false, { error: errorToString(error) });
        }
      },
      { scope: "write" },
    );

    api.registerGatewayMethod(
      "memu.retrieve",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ params, respond }: { params: any; respond: any }) => {
        try {
          const result = await client.retrieve({
            query: String(params?.query ?? ""),
            userId: cfg.userId,
            agentId: cfg.agentId || undefined,
            method: cfg.retrieveMethod,
            topK: Number(params?.topK ?? cfg.recallTopK),
          });
          respond(true, result);
        } catch (error) {
          respond(false, { error: errorToString(error) });
        }
      },
      { scope: "read" },
    );

    api.registerGatewayMethod(
      "memu.clear",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async ({ respond }: { respond: any }) => {
        try {
          await client.clear({ userId: cfg.userId, agentId: cfg.agentId || undefined });
          respond(true, { ok: true });
        } catch (error) {
          respond(false, { error: errorToString(error) });
        }
      },
      { scope: "write" },
    );

    // 4) Explicit LLM-callable tools.
    api.registerTool(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (toolArgs: any) => {
        const result = await client.retrieve({
          query: String(toolArgs?.query ?? ""),
          userId: cfg.userId,
          agentId: cfg.agentId || undefined,
          method: cfg.retrieveMethod,
          topK: Number(toolArgs?.topK ?? cfg.recallTopK),
        });
        return result;
      },
      {
        name: "memu_recall",
        description: "Recall relevant memories from memU for a given query.",
      },
    );

    api.registerTool(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (toolArgs: any) => {
        const text = String(toolArgs?.text ?? "");
        const role = (toolArgs?.role ?? "user") as MemUMessage["role"];
        const messages: MemUMessage[] = [{ role, content: { text } }];
        await captureMessages(client, cfg, messages);
        return { ok: true, category: detectCategory(text) };
      },
      {
        name: "memu_store",
        description:
          "Explicitly store a memory text into memU. Auto-categorized via the same triggers as auto-capture.",
      },
    );

    api.registerTool(
      // memU doesn't expose per-item delete; this tool clears the entire
      // (userId, agentId) bucket. Use with care — surfaces in plugin
      // capability list as memu_forget.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async () => {
        await client.clear({ userId: cfg.userId, agentId: cfg.agentId || undefined });
        return { ok: true };
      },
      {
        name: "memu_forget",
        description:
          "Clear all memU memories for the current (userId, agentId) scope. Destructive; cannot be undone.",
      },
    );

    // 5) CLI registration: `openclaw memu <subcommand>`.
    api.registerCli(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ program }: { program: any }) => {
        const cmd = program
          .command("memu")
          .description("memU memory plugin: search, store, stats, clear");

        cmd
          .command("search <query...>")
          .description("Search memories matching query")
          .option("--top-k <n>", "Top K results", String(cfg.recallTopK))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .action(async (queryParts: string[], opts: { topK: string }) => {
            const result = await client.retrieve({
              query: queryParts.join(" "),
              userId: cfg.userId,
              agentId: cfg.agentId || undefined,
              method: cfg.retrieveMethod,
              topK: Number(opts.topK),
            });
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(result, null, 2));
          });

        cmd
          .command("stats")
          .description("Show memU bucket stats for the configured user/agent scope")
          .action(async () => {
            const result = await client.retrieve({
              query: "*",
              userId: cfg.userId,
              agentId: cfg.agentId || undefined,
              method: cfg.retrieveMethod,
              topK: 1,
            });
            // eslint-disable-next-line no-console
            console.log(
              JSON.stringify(
                {
                  userId: cfg.userId,
                  agentId: cfg.agentId,
                  approxItems: Array.isArray(result.items) ? result.items.length : 0,
                  categories: Array.isArray(result.categories) ? result.categories.length : 0,
                },
                null,
                2,
              ),
            );
          });

        cmd
          .command("clear")
          .description("Clear ALL memU memories for the current (userId, agentId) scope")
          .option("--yes", "Confirm destructive action", false)
          .action(async (opts: { yes: boolean }) => {
            if (!opts.yes) {
              // eslint-disable-next-line no-console
              console.error("memu clear: pass --yes to confirm. This deletes everything.");
              process.exit(2);
            }
            await client.clear({ userId: cfg.userId, agentId: cfg.agentId || undefined });
            // eslint-disable-next-line no-console
            console.log(JSON.stringify({ ok: true }, null, 2));
          });
      },
      {
        descriptors: [
          {
            name: "memu",
            description: "memU memory plugin: search, store, stats, clear",
            hasSubcommands: true,
          },
        ],
      },
    );
  },
};

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export default memuPlugin;
