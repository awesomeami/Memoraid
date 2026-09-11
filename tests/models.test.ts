import { describe, it, expect, vi } from "vitest";
import { MODEL_IDS, normalizeModelPreference, parseModelTier } from "../src/models";
import { GeminiRouter, isModelUnavailable, type GeminiClient } from "../src/lib/gemini-router";
import { parseMnemonicResponse } from "../src/lib/mnemonic-response";

const error = (status: number, message = "upstream failure") => Object.assign(new Error(message), { status });
function client() {
  return { models: {
    list: vi.fn(() => { throw new Error("Model discovery must never run"); }),
    generateContent: vi.fn<GeminiClient["models"]["generateContent"]>().mockResolvedValue({ text: "OK" } as never),
  } };
}
const router = (env = {}) => new GeminiRouter({ env });

describe("saved model preferences", () => {
  it.each([
    ["gemini-3.6-flash", "flash"], ["gemini-3.8-flash", "flash"],
    ["gemini-3.1-flash-lite", "flash-lite"], ["gemini-3.5-flash-lite", "flash-lite"],
    ["gemini-3.1-pro-preview", "pro"], ["gemini-flash-latest", "flash"],
    ["gemini-flash-lite-latest", "flash-lite"],
    ["models/gemini-3-flash-preview", "flash"], [null, "flash"], ["bad-value", "flash"],
  ])("migrates %s to %s", (value, expected) => expect(normalizeModelPreference(value)).toBe(expected));
  it("rejects unsupported client model IDs", () => {
    expect(parseModelTier("gemini-3.1-flash-image")).toBeUndefined();
    expect(parseModelTier("https://example.com/model")).toBeUndefined();
  });
});

describe("direct model selection", () => {
  it.each(["flash", "flash-lite", "pro"] as const)("uses exactly one call for %s, with no model discovery or SDK retries", async tier => {
    const ai = client();
    const request = { contents: "clinical notes", config: { systemInstruction: "accuracy", responseMimeType: "application/json" } };
    const result = await router().generate(ai, tier, request);
    expect(result.modelUsed).toBe(MODEL_IDS[tier]);
    expect(ai.models.list).not.toHaveBeenCalled();
    expect(ai.models.generateContent).toHaveBeenCalledTimes(1);
    expect(ai.models.generateContent.mock.calls[0][0]).toMatchObject({ ...request, model: MODEL_IDS[tier], config: { httpOptions: { timeout: 45_000, retryOptions: { attempts: 1 } } } });
  });
  it("sends the Flash latest alias even for an old browser request", async () => {
    const ai = client();
    await router().generate(ai, "gemini-3.6-flash", { contents: "x" });
    expect(ai.models.generateContent.mock.calls[0][0].model).toBe("gemini-flash-latest");
  });
  it("records the resolved model version returned by Google", async () => {
    const ai = client();
    ai.models.generateContent.mockResolvedValue({ text: "OK", modelVersion: "gemini-3.8-flash" } as never);
    expect((await router().generate(ai, "flash", { contents: "x" })).modelUsed).toBe("gemini-3.8-flash");
  });
  it.each([404, 410])("reports missing model status %s immediately without fallback", async status => {
    const ai = client(); ai.models.generateContent.mockRejectedValue(error(status));
    await expect(router().generate(ai, "flash", { contents: "x" })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    expect(ai.models.generateContent).toHaveBeenCalledTimes(1);
    expect(ai.models.list).not.toHaveBeenCalled();
  });
  it("distinguishes unavailable models from invalid keys, content and quota", () => {
    expect(isModelUnavailable(error(400, "models/foo is not supported for generateContent"))).toBe(true);
    expect(isModelUnavailable(error(403, "You do not have access to model foo"))).toBe(true);
    expect(isModelUnavailable(error(403, "API key blocked"))).toBe(false);
    expect(isModelUnavailable(error(400, "Invalid response schema"))).toBe(false);
    expect(isModelUnavailable(error(429, "model quota exceeded"))).toBe(false);
  });
  it.each([429, 403, 400])("returns status %s to key/error handling without retrying", async status => {
    const ai = client(); const failure = error(status); ai.models.generateContent.mockRejectedValue(failure);
    await expect(router().generate(ai, "flash", { contents: "x" })).rejects.toBe(failure);
    expect(ai.models.generateContent).toHaveBeenCalledTimes(1);
  });
  it.each([500, 502, 503, 504])("reports service status %s without retrying", async status => {
    const ai = client(); ai.models.generateContent.mockRejectedValue(error(status));
    await expect(router().generate(ai, "flash", { contents: "x" })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(ai.models.generateContent).toHaveBeenCalledTimes(1);
  });
  it("honors a single operator pin without crossing families", async () => {
    const ai = client();
    expect((await router({ GEMINI_FLASH_MODEL: "gemini-3.8-flash" }).generate(ai, "flash", { contents: "x" })).modelUsed).toBe("gemini-3.8-flash");
    await expect(router({ GEMINI_FLASH_LITE_MODEL: "gemini-3.8-flash" }).generate(ai, "flash-lite", { contents: "x" })).rejects.toMatchObject({ code: "MODEL_CONFIGURATION_ERROR" });
    await expect(router({ GEMINI_FLASH_MODEL: "gemini-3.8-flash,gemini-3.6-flash" }).generate(ai, "flash", { contents: "x" })).rejects.toMatchObject({ code: "MODEL_CONFIGURATION_ERROR" });
  });
  it("reduces the Gemini timeout when authentication has consumed the request budget", async () => {
    const ai = client();
    await new GeminiRouter({ env: {}, now: () => 30_000 }).generate(ai, "flash", { contents: "x" }, 50_000);
    expect(ai.models.generateContent.mock.calls[0][0].config?.httpOptions?.timeout).toBe(20_000);
  });
  it("does not start a call after the request deadline", async () => {
    const ai = client();
    await expect(new GeminiRouter({ env: {}, now: () => 51_000 }).generate(ai, "flash", { contents: "x" }, 50_000)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(ai.models.generateContent).not.toHaveBeenCalled();
  });
  it("aborts an outstanding call at the deadline and returns a service error", async () => {
    const ai = client();
    ai.models.generateContent.mockImplementation(({ config }) => new Promise((_, reject) => {
      config!.abortSignal!.addEventListener("abort", () => reject(new DOMException("Request timed out", "TimeoutError")), { once: true });
    }));
    await expect(new GeminiRouter({ env: {}, now: () => 0 }).generate(ai, "flash", { contents: "x" }, 25)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(ai.models.generateContent).toHaveBeenCalledTimes(1);
  });
});

describe("structured response boundary", () => {
  const details = { mnemonic: "TEST", strategyUsed: "Acronym", expansion: [{ letter: "T", concept: "Test" }], memorabilityScore: 8 };
  it("accepts a complete winner and alternative", () => {
    expect(parseMnemonicResponse(JSON.stringify({ bestMnemonic: details, alternativeMnemonics: [details] })).bestMnemonic).toEqual(details);
  });
  it.each(["null", "{}", "bad json", JSON.stringify({ bestMnemonic: details, alternativeMnemonics: [] }), JSON.stringify({ bestMnemonic: { ...details, memorabilityScore: 99 }, alternativeMnemonics: [details] })])("rejects invalid model output %s", text => {
    expect(() => parseMnemonicResponse(text)).toThrow();
  });
});
