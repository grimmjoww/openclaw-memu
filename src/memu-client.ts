/**
 * MemU HTTP client — thin shim over memU-server's /api/v3/memory/* endpoints.
 *
 * memU-server is async-Temporal-backed: memorize() returns immediately with a
 * task_id and PENDING status; the actual extraction completes in the worker.
 * Callers that need to confirm storage should poll
 * /api/v3/memory/memorize/status/{task_id} (not exposed here yet — add when needed).
 */

export type MemUMessage = {
  role: "user" | "assistant" | "system";
  content: { text: string };
  created_at?: string;
};

export type MemorizeOptions = {
  conversation: MemUMessage[];
  userId: string;
  agentId?: string;
};

export type MemorizeResult = {
  task_id: string;
  status: string; // PENDING | RUNNING | COMPLETED | FAILED
  message?: string;
};

export type RetrieveOptions = {
  query: string;
  userId?: string;
  agentId?: string;
  method?: "rag" | "llm";
  topK?: number;
  skipRouting?: boolean;
};

export type RetrieveResult = {
  needs_retrieval?: boolean;
  original_query?: string;
  rewritten_query?: string;
  next_step_query?: string;
  categories: unknown[];
  items: unknown[];
  resources: unknown[];
};

export type ClearOptions = {
  userId?: string;
  agentId?: string;
};

export class MemUClient {
  constructor(private readonly serverUrl: string) {}

  async memorize(opts: MemorizeOptions): Promise<MemorizeResult> {
    return this.callForTesting("/api/v3/memory/memorize", {
      conversation: opts.conversation,
      user_id: opts.userId,
      agent_id: opts.agentId ?? "",
    }) as Promise<MemorizeResult>;
  }

  async retrieve(opts: RetrieveOptions): Promise<RetrieveResult> {
    return this.callForTesting("/api/v3/memory/retrieve", {
      query: opts.query,
      ...(opts.userId !== undefined ? { user_id: opts.userId } : {}),
      ...(opts.agentId !== undefined ? { agent_id: opts.agentId } : {}),
      ...(opts.method !== undefined ? { method: opts.method } : {}),
      ...(opts.topK !== undefined ? { top_k: opts.topK } : {}),
      ...(opts.skipRouting !== undefined ? { skip_routing: opts.skipRouting } : {}),
    }) as Promise<RetrieveResult>;
  }

  async clear(opts: ClearOptions): Promise<void> {
    await this.callForTesting("/api/v3/memory/clear", {
      ...(opts.userId !== undefined ? { user_id: opts.userId } : {}),
      ...(opts.agentId !== undefined ? { agent_id: opts.agentId } : {}),
    });
  }

  /**
   * Internal helper exposed for negative-path testing (asserts that
   * non-2xx responses become thrown errors with the status + body included).
   * Production callers should use the typed methods above.
   */
  async callForTesting(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.serverUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`memU ${path} failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as { status: string; result: unknown };
    return json.result;
  }
}
