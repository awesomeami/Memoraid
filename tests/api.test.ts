import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { requestWithKeyRotation } from "../src/lib/key-rotation";

const state = vi.hoisted(() => ({
  calls: [] as { key: string; params: any }[],
  outcomes: [] as ({ status: number; message?: string } | { text: string })[],
  documents: new Map<string, any>(),
  serial: 0,
}));
vi.mock("@google/genai", async importOriginal => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return { ...actual, GoogleGenAI: class {
    models;
    constructor({ apiKey }: { apiKey: string }) {
      this.models = {
        generateContent: async (params: any) => {
          state.calls.push({ key: apiKey, params });
          const next = state.outcomes.shift();
          if (!next) throw new Error("Unexpected Gemini request in test");
          if ("status" in next) throw Object.assign(new Error(next.message || "upstream failure"), { status: next.status });
          const versions: Record<string, string> = { "gemini-flash-latest": "gemini-3.8-flash", "gemini-flash-lite-latest": "gemini-3.5-flash-lite" };
          return { text: next.text, modelVersion: versions[params.model] || params.model };
        },
      };
    }
  } };
});
vi.mock("firebase-admin/app", () => ({ getApps: () => [{}], getApp: () => ({}), initializeApp: () => ({}), cert: () => ({}) }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken: async (token: string) => {
  if (token !== "test-token") throw new Error("Invalid token");
  return { uid: "test-user" };
} }) }));
vi.mock("firebase-admin/firestore", () => ({
  Timestamp: { fromDate: (date: Date) => date.toISOString() },
  getFirestore: () => ({
    collection: (name: string) => ({ doc: (id: string) => `${name}/${id}` }),
    runTransaction: async (run: any) => run({
      get: async (id: string) => ({ exists: state.documents.has(id), data: () => state.documents.get(id) }),
      set: (id: string, data: any) => state.documents.set(id, { ...state.documents.get(id), ...data }),
    }),
  }),
}));

const details = { mnemonic: "TEST", strategyUsed: "Acronym", expansion: [{ letter: "T", concept: "Test fact", details: "A fixture, not clinical advice" }], whyItWorks: "Easy to recall", memorabilityScore: 8 };
const guide = JSON.stringify({ bestMnemonic: details, alternativeMnemonics: [details] });
let server: Server;
let base: string;
beforeAll(async () => {
  const { app } = await import("../src/server-app");
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
beforeEach(() => { state.calls = []; state.outcomes = []; state.documents.clear(); state.serial++; });

function post(path: string, body: unknown, token = "test-token") {
  return fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-User-Gemini-Key": `api-key-${state.serial}` }, body: JSON.stringify(body) });
}

describe("Express → model resolver → response and key rotation", () => {
  it("generates using a migrated Flash preference and returns validated data and model identity", async () => {
    state.outcomes.push({ text: guide });
    const response = await post("/api/mnemonic/generate", { medicalText: "fixture notes", selectedModel: "gemini-3.6-flash" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ bestMnemonic: details, modelUsed: "gemini-3.8-flash" });
    expect(state.calls[0].params.config.responseMimeType).toBe("application/json");
    expect(state.calls[0].params.config.systemInstruction).toContain("RIGOROUS MEDICAL ACCURACY");
    expect(state.calls[0].params.model).toBe("gemini-flash-latest");
    expect(state.calls[0].params.config.httpOptions.timeout).toBeLessThanOrEqual(45_000);
    expect(state.calls).toHaveLength(1);
  });
  it("rotates a 429 key in a separate request with the same alias while counting a generation once", async () => {
    state.outcomes.push({ status: 429 }, { text: guide });
    const result = await requestWithKeyRotation<{ modelUsed: string }>({
      url: base + "/api/mnemonic/generate", keys: [{ key: `a-${state.serial}`, index: 0 }, { key: `b-${state.serial}`, index: 3 }], startIndex: 0,
      headers: { Authorization: "Bearer test-token", "X-Generation-ID": "single-user-action" },
      body: { medicalText: "fixture notes", selectedModel: "flash" },
    });
    expect(result.keySlotIndex).toBe(3);
    expect(state.calls.map(c => c.params.model)).toEqual(["gemini-flash-latest", "gemini-flash-latest"]);
    expect(state.calls.map(c => c.key)).toEqual([`a-${state.serial}`, `b-${state.serial}`]);
    expect(state.documents.get("rate_limits/test-user").generate_count).toBe(1);
  });
  it("OCR honors Lite, preserves image order, and returns pages", async () => {
    state.outcomes.push({ text: "page one\n---MEMORAID_PAGE_BREAK---\npage two" });
    const images = [{ mimeType: "image/jpeg", imageBase64: "YWJj" }, { mimeType: "image/png", imageBase64: "ZGVm" }];
    const response = await post("/api/mnemonic/ocr-extract", { images, selectedModel: "gemini-3.5-flash-lite" });
    expect(await response.json()).toEqual({ pages: [{ index: 0, extractedText: "page one" }, { index: 1, extractedText: "page two" }], modelUsed: "gemini-3.5-flash-lite" });
    expect(state.calls[0].params.contents.slice(0, 2)).toEqual(images.map(i => ({ inlineData: { mimeType: i.mimeType, data: i.imageBase64 } })));
    expect(state.calls[0].params.model).toBe("gemini-flash-lite-latest");
  });
  it("key validation uses the same resolver and does not label an unavailable model as an invalid key", async () => {
    state.outcomes.push({ status: 404 });
    const response = await post("/api/mnemonic/validate-key", { modelToValidate: "flash" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "MODEL_UNAVAILABLE" });
    expect(state.calls).toHaveLength(1);
  });
  it("retains a rate-limited key with an explicit unverified warning", async () => {
    state.outcomes.push({ status: 429 });
    const response = await post("/api/mnemonic/validate-key", { modelToValidate: "flash-lite" });
    expect(await response.json()).toMatchObject({ success: true, verified: false, warning: expect.stringContaining("has not yet been verified") });
  });
  it("rejects malformed generation output before returning a broken card", async () => {
    state.outcomes.push({ text: "{}" });
    expect((await post("/api/mnemonic/generate", { medicalText: "notes" })).status).toBe(502);
  });
  it.each(["generate", "ocr-extract", "validate-key"])("keeps authentication on %s", async route => {
    expect((await post(`/api/mnemonic/${route}`, {}, "invalid")).status).toBe(401);
    expect(state.calls).toHaveLength(0);
  });
  it("does not rotate keys when the application rate limit is reached", async () => {
    state.documents.set("rate_limits/test-user", { generate_count: 100, generate_window_start: Date.now() });
    const fetcher = vi.fn<typeof fetch>(fetch);
    await expect(requestWithKeyRotation({ url: base + "/api/mnemonic/generate", keys: [{ key: "a", index: 0 }, { key: "b", index: 1 }], startIndex: 0, headers: { Authorization: "Bearer test-token" }, body: { medicalText: "notes" }, fetcher })).rejects.toMatchObject({ type: "server" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(state.calls).toHaveLength(0);
  });
});
