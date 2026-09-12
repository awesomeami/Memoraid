import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GoogleGenAI, Type } from "@google/genai";
import { GeminiRouter } from "../src/lib/gemini-router";

// Exercise the real SDK against a local HTTP fixture: no keys or Google quota needed.
let server: Server;
let ai: GoogleGenAI;
let status: number;
let statusSequence: number[];
let errorMessage: string;
let requests: { url?: string; body: any }[];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
    const code = statusSequence.shift() ?? status;
    if (code === 0) return; // Deliberately stalled upstream; client must abort.
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(code === 200 ? {
      candidates: [{ content: { role: "model", parts: [{ text: '{"ok":true}' }] }, finishReason: "STOP" }],
      modelVersion: "resolved-model-version",
    } : { error: { code, status: code === 429 ? "RESOURCE_EXHAUSTED" : "UNAVAILABLE", message: errorMessage } }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  ai = new GoogleGenAI({ apiKey: "local-test-key", httpOptions: { baseUrl: `http://127.0.0.1:${port}` } });
});
beforeEach(() => { status = 200; statusSequence = []; errorMessage = "Fixture failure"; requests = []; });
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
  it("recognizes Google's real high-demand error shape and sends the same request to each fallback once", async () => {
    statusSequence = [503, 503, 200];
    errorMessage = "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.";
    const result = await new GeminiRouter({ env: {} }).generate(ai, "flash", {
      contents: "Fixture prompt", config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { ok: { type: Type.BOOLEAN } } } },
    });
    expect(result.response.text).toBe('{"ok":true}');
    expect(requests.map(r => r.url)).toEqual([
      "/v1beta/models/gemini-3.8-flash:generateContent",
      "/v1beta/models/gemini-3.7-flash:generateContent",
      "/v1beta/models/gemini-3.6-flash:generateContent",
    ]);
    expect(requests[1].body).toEqual(requests[0].body);
    expect(requests[2].body).toEqual(requests[0].body);
  });
});
