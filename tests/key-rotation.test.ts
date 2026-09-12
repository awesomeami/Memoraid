import { afterEach, describe, it, expect, vi } from "vitest";
import { requestWithKeyRotation } from "../src/lib/key-rotation";

const keys = Array.from({ length: 5 }, (_, index) => ({ key: `key-${index}`, index }));
const response = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
const options = { url: "/api/mnemonic/generate", keys, startIndex: 2, headers: { Authorization: "Bearer token", "X-Generation-ID": "same-generation" }, body: { medicalText: "notes", selectedModel: "flash" } };
afterEach(() => { vi.useRealTimers(); });

function delayedResponse(ms: number, status = 200): typeof fetch {
  return (_url, init) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(response(status, status === 200 ? { ok: true } : { error: "RESOURCE_EXHAUSTED" })), ms);
    init!.signal!.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

describe("API key rotation", () => {
  it("starts at the active slot, wraps, keeps request identity, and remembers the successful original slot", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(429, { error: "RESOURCE_EXHAUSTED" })).mockResolvedValueOnce(response(403, { error: "GEMINI_KEY_ERROR" })).mockResolvedValueOnce(response(200, { ok: true }));
    expect(await requestWithKeyRotation({ ...options, fetcher })).toEqual({ data: { ok: true }, keySlotIndex: 4 });
    expect(fetcher.mock.calls.map(([, init]) => (init!.headers as Record<string, string>)["X-User-Gemini-Key"])).toEqual(["key-2", "key-3", "key-4"]);
    expect(fetcher.mock.calls.every(([, init]) => init!.body === JSON.stringify(options.body) && (init!.headers as Record<string, string>)["X-Generation-ID"] === "same-generation")).toBe(true);
  });
  it("tries each of five keys only once when all quotas are exhausted", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(429, { error: "RESOURCE_EXHAUSTED" }));
    await expect(requestWithKeyRotation({ ...options, fetcher })).rejects.toMatchObject({ type: "key" });
    expect(fetcher.mock.calls.map(([, init]) => (init!.headers as Record<string, string>)["X-User-Gemini-Key"])).toEqual(["key-2", "key-3", "key-4", "key-0", "key-1"]);
  });
  it.each([[429, "APP_RATE_LIMIT", "server"], [401, "Unauthorized", "auth"], [400, "MODEL_CONFIGURATION_ERROR", "server"], [413, "Too large", "server"]])("stops for %s %s", async (status, code, type) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(status as number, { error: code }));
    await expect(requestWithKeyRotation({ ...options, fetcher })).rejects.toMatchObject({ type });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["MODEL_UNAVAILABLE", "SERVICE_UNAVAILABLE"])("stops promptly for %s without cycling through keys", async code => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(503, { error: code, details: "Model unavailable" }));
    await expect(requestWithKeyRotation({ ...options, fetcher })).rejects.toMatchObject({ type: "server", message: "Model unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses the same rotation for OCR and retains the images", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(429, { error: "RESOURCE_EXHAUSTED" })).mockResolvedValueOnce(response(200, { pages: [] }));
    const body = { images: [{ imageBase64: "encoded", mimeType: "image/jpeg" }] };
    const result = await requestWithKeyRotation({ ...options, url: "/api/mnemonic/ocr-extract", keys: [{ key: "a", index: 1 }, { key: "b", index: 4 }], startIndex: 0, body, fetcher });
    expect(result.keySlotIndex).toBe(4);
    expect(fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify(body));
  });
  it("stops on cancellation without rotating", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => { controller.abort(); throw new DOMException("Aborted", "AbortError"); });
    await expect(requestWithKeyRotation({ ...options, signal: controller.signal, fetcher })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not treat HTML gateway errors or network errors as invalid keys", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("Gateway timeout", { status: 504 }));
    await expect(requestWithKeyRotation({ ...options, fetcher })).rejects.toMatchObject({ type: "server" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["generate", "ocr-extract"])("accepts a %s response after the full server window plus network overhead", async route => {
    vi.useFakeTimers();
    const fetcher = vi.fn(delayedResponse(60_500));
    const request = requestWithKeyRotation({ ...options, url: `/api/mnemonic/${route}`, fetcher });
    const assertion = expect(request).resolves.toMatchObject({ data: { ok: true }, keySlotIndex: 2 });
    await vi.advanceTimersByTimeAsync(60_500);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("gives the next key a fresh window after a late quota response", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(delayedResponse(58_000, 429)).mockImplementationOnce(delayedResponse(58_000));
    const assertion = expect(requestWithKeyRotation({ ...options, fetcher })).resolves.toMatchObject({ keySlotIndex: 3 });
    await vi.advanceTimersByTimeAsync(116_000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("still cancels a stalled request at 65 seconds without rotating keys", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(delayedResponse(90_000));
    const assertion = expect(requestWithKeyRotation({ ...options, fetcher })).rejects.toMatchObject({ type: "server", message: "The request timed out. Please try again." });
    await vi.advanceTimersByTimeAsync(64_999);
    expect(fetcher.mock.calls[0][1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
