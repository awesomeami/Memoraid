import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { FLASH_MODELS, MODEL_IDS, parseModelTier, type ModelTier } from "../models.js";

export interface GeminiClient {
  models: {
    generateContent(params: GenerateContentParameters): Promise<GenerateContentResponse>;
  };
}

export class ModelRoutingError extends Error {
  constructor(public code: "MODEL_UNAVAILABLE" | "MODEL_CONFIGURATION_ERROR" | "SERVICE_UNAVAILABLE", message: string) {
    super(message);
  }
}

function statusOf(error: unknown): number {
  const e = error as { status?: unknown; code?: unknown; statusCode?: unknown; error?: { code?: unknown } };
  for (const value of [e?.status, e?.code, e?.statusCode, e?.error?.code]) {
    const status = Number(value);
    if (Number.isInteger(status) && status >= 100 && status < 600) return status;
  }
  return 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isModelUnavailable(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 404 || status === 410) return true;
  return [0, 400, 403].includes(status) &&
    /\bmodel[s]?\b/i.test(messageOf(error)) &&
    /not found|not supported|no longer available|deprecated|does not exist|do not have access|don't have access/i.test(messageOf(error));
}

const ENV_NAMES: Record<ModelTier, string> = {
  flash: "GEMINI_FLASH_MODEL", "flash-lite": "GEMINI_FLASH_LITE_MODEL", pro: "GEMINI_PRO_MODEL",
};

/** Flash falls back only on provider overload; all attempts share one deadline. */
export class GeminiRouter {
  constructor(private readonly options: {
    env?: Record<string, string | undefined>;
    now?: () => number;
  } = {}) {}

  async generate(
    client: GeminiClient,
    preference: unknown,
    params: Omit<GenerateContentParameters, "model">,
    requestDeadline?: number,
  ) {
    const tier = parseModelTier(preference);
    if (!tier) throw new ModelRoutingError("MODEL_CONFIGURATION_ERROR", "Choose Flash, Flash-Lite, or Pro and try again.");
    const model = (this.options.env ?? process.env)[ENV_NAMES[tier]]?.trim() || MODEL_IDS[tier];
    // An optional single pin allows rollback without changing source code.
    if (!model.startsWith("gemini-") || parseModelTier(model) !== tier) {
      throw new ModelRoutingError("MODEL_CONFIGURATION_ERROR", `The server's ${ENV_NAMES[tier]} setting must contain one ${tier} model ID. Please contact the site owner.`);
    }
    // An operator pin to an older known Flash starts at that version; other pins stay exact.
    const flashIndex = FLASH_MODELS.indexOf(model);
    const candidates = tier === "flash" && flashIndex >= 0 ? FLASH_MODELS.slice(flashIndex) : [model];
    const clock = this.options.now ?? Date.now;
    const startedAt = clock();
    const timeout = Math.min(59_000, (requestDeadline ?? startedAt + 59_000) - startedAt);
    if (timeout <= 0) throw new ModelRoutingError("SERVICE_UNAVAILABLE", "The request ran out of time before reaching Gemini. Please try again.");
    const deadline = startedAt + timeout;
    const abortSignal = AbortSignal.timeout(timeout);

    for (let attempt = 1; ; attempt++) {
      const activeModel = candidates[attempt - 1];
      const remaining = deadline - clock();
      if (abortSignal.aborted || remaining <= 0) {
        throw new ModelRoutingError("SERVICE_UNAVAILABLE", `Gemini ${tier} did not finish within the request's time limit. Please try again, or choose Flash-Lite.`);
      }
      try {
        const response = await client.models.generateContent({ ...params, model: activeModel, config: {
          ...params.config,
          httpOptions: { ...params.config?.httpOptions, timeout: remaining, retryOptions: { attempts: 1 } },
          abortSignal,
        } });
        const modelUsed = response.modelVersion || activeModel;
        console.info("Gemini request completed", { tier, modelUsed, attempt, elapsedMs: clock() - startedAt });
        return { response, modelUsed };
      } catch (error) {
        const status = statusOf(error);
        const timedOut = abortSignal.aborted || clock() >= deadline;
        // Never log keys, prompts, or provider response bodies.
        console.warn("Gemini request failed", {
          tier, model: activeModel, attempt, upstreamStatus: status,
          elapsedMs: clock() - startedAt, timeoutMs: timeout, deadlineExceeded: timedOut,
        });
        if (isModelUnavailable(error)) {
          throw new ModelRoutingError("MODEL_UNAVAILABLE", `Gemini ${tier} is currently unavailable for this key. Select another model family or try again later.`);
        }
        if (status === 503 && /high demand|overload|capacity/i.test(messageOf(error)) &&
          !timedOut && attempt < candidates.length && deadline - clock() >= 10_000) {
          // Try only the next configured Flash, with the same key and remaining budget.
          continue;
        }
        if (timedOut || (status === 0 && /timeout|timed out|aborted/i.test(messageOf(error)))) {
          throw new ModelRoutingError("SERVICE_UNAVAILABLE", `Gemini ${tier} did not finish within the request's time limit. Please try again, or choose Flash-Lite.`);
        }
        if (status === 503) {
          const reason = /high demand|overload|capacity/i.test(messageOf(error)) ? "is temporarily overloaded" : "is temporarily unavailable";
          throw new ModelRoutingError("SERVICE_UNAVAILABLE", `Google's Gemini ${tier} service ${reason}. Please try again shortly, or choose Flash-Lite.`);
        }
        if ([500, 502, 504].includes(status) || (status === 0 && /UNAVAILABLE/i.test(messageOf(error)))) {
          throw new ModelRoutingError("SERVICE_UNAVAILABLE", `Google's Gemini ${tier} service returned a temporary error. Please try again shortly.`);
        }
        // Quota and invalid-key errors return immediately to the browser's key rotation.
        throw error;
      }
    }
  }
}

export const geminiRouter = new GeminiRouter();
// OCR always follows Flash-Lite latest, independent of generation model pins.
export const ocrRouter = new GeminiRouter({ env: { GEMINI_FLASH_LITE_MODEL: "gemini-flash-lite-latest" } });
