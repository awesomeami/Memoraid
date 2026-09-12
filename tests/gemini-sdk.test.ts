import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiRouter } from "../src/lib/gemini-router";

// Exercise the real SDK against a local HTTP fixture: no keys or Google quota needed.
let server: Server;
let ai: GoogleGenAI;
let status: number;
let requests: { url?: string; body: any }[];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
    if (status === 0) return; // Deliberately stalled upstream; client must abort.
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status === 200 ? {
      candidates: [{ content: { role: "model", parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }],
      modelVersion: "resolved-model-version",
    } : { error: { code: status, status: status === 429 ? "RESOURCE_EXHAUSTED" : "UNAVAILABLE", message: "Fixture failure" } }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  ai = new GoogleGenAI({ apiKey: "local-test-key", httpOptions: { baseUrl: `http://127.0.0.1:${port}` } });
});
beforeEach(() => { status = 200; requests = []; });
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("real Gemini SDK transport", () => {
  it.each([["flash", "gemini-3.8-flash"], ["flash-lite", "gemini-flash-lite-latest"]])("serializes the %s model and structured request correctly", async (tier, model) => {
    const { response, modelUsed } = await new GeminiRouter({ env: {} }).generate(ai, tier, {
      contents: "Fixture prompt",
      config: { systemInstruction: "Fixture instruction", responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { ok: { type: Type.BOOLEAN } } } },
    });
    expect(response.text).toBe('{"ok":true}');
    expect(modelUsed).toBe("resolved-model-version");
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain(`/models/${model}:generateContent`);
    expect(requests[0].body).toMatchObject({
      contents: [{ parts: [{ text: "Fixture prompt" }] }],
      systemInstruction: { parts: [{ text: "Fixture instruction" }] },
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT" } },
    });
  });
  it.each([429, 503])("makes only one HTTP attempt when Google returns %s", async code => {
    status = code;
    const request = new GeminiRouter({ env: {} }).generate(ai, "flash", { contents: "x" });
    await expect(request).rejects.toMatchObject(code === 429 ? { status: 429 } : { code: "SERVICE_UNAVAILABLE" });
    expect(requests).toHaveLength(1);
  });
  it("cancels an actual stalled HTTP call within the remaining deadline", async () => {
    status = 0;
    await expect(new GeminiRouter({ env: {}, now: () => 0 }).generate(ai, "flash", { contents: "x" }, 100)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(requests).toHaveLength(1);
  });
});
