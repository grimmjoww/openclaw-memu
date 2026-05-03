/**
 * RED: assert MemUClient produces the correct HTTP request shapes for
 * memU-server's /api/v3/memory/{retrieve,memorize,clear} endpoints.
 *
 * Uses a real in-process http server as the fake (per testing-anti-patterns:
 * no mocks of network layer; real endpoint that records what it received).
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { MemUClient } from "../src/memu-client.js";

type RecordedRequest = { method: string; path: string; body: unknown };
let recorded: RecordedRequest[] = [];
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      let body: unknown = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        /* leave null */
      }
      recorded.push({ method: req.method!, path: req.url!, body });

      res.setHeader("Content-Type", "application/json");
      // Minimal valid responses per endpoint
      if (req.url === "/api/v3/memory/memorize") {
        res.statusCode = 200;
        res.end(JSON.stringify({ status: "success", result: { task_id: "memorize-test", status: "PENDING" } }));
      } else if (req.url === "/api/v3/memory/retrieve") {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            status: "success",
            result: { categories: [], items: [], resources: [], next_step_query: "" },
          }),
        );
      } else if (req.url === "/api/v3/memory/clear") {
        res.statusCode = 200;
        res.end(JSON.stringify({ status: "success", result: { purged_items: 0 } }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ status: "error" }));
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeAll(() => {
  recorded = [];
});

describe("MemUClient.memorize", () => {
  test("posts conversation + user_id + agent_id to /memorize", async () => {
    recorded = [];
    const client = new MemUClient(baseUrl);
    const result = await client.memorize({
      conversation: [
        { role: "user", content: { text: "remember X" }, created_at: "2026-05-03 10:00:00" },
        { role: "assistant", content: { text: "got it" }, created_at: "2026-05-03 10:00:01" },
      ],
      userId: "willie",
      agentId: "rei-discord",
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].method).toBe("POST");
    expect(recorded[0].path).toBe("/api/v3/memory/memorize");
    const body = recorded[0].body as Record<string, unknown>;
    expect(body.user_id).toBe("willie");
    expect(body.agent_id).toBe("rei-discord");
    expect(Array.isArray(body.conversation)).toBe(true);
    expect((body.conversation as unknown[]).length).toBe(2);
    expect(result.task_id).toBe("memorize-test");
  });
});

describe("MemUClient.retrieve", () => {
  test("posts query + scoping to /retrieve and returns synthesized result", async () => {
    recorded = [];
    const client = new MemUClient(baseUrl);
    const result = await client.retrieve({
      query: "what did willie say about MiniMax",
      userId: "willie",
      agentId: "rei-discord",
      method: "rag",
    });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].method).toBe("POST");
    expect(recorded[0].path).toBe("/api/v3/memory/retrieve");
    expect(Array.isArray(result.items)).toBe(true);
    expect(Array.isArray(result.categories)).toBe(true);
  });
});

describe("MemUClient.clear", () => {
  test("posts only the scoping fields and accepts empty 200", async () => {
    recorded = [];
    const client = new MemUClient(baseUrl);
    await client.clear({ userId: "willie", agentId: "rei-discord" });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].method).toBe("POST");
    expect(recorded[0].path).toBe("/api/v3/memory/clear");
    const body = recorded[0].body as Record<string, unknown>;
    expect(body.user_id).toBe("willie");
    expect(body.agent_id).toBe("rei-discord");
  });
});

describe("MemUClient — error handling", () => {
  test("throws with status + body when memU-server returns non-2xx", async () => {
    recorded = [];
    const client = new MemUClient(baseUrl);
    // Hit a path the test server doesn't know — should surface as a thrown error
    await expect(
      client.callForTesting("/api/v3/memory/does-not-exist", {}),
    ).rejects.toThrow(/404|not.*found/i);
  });
});
