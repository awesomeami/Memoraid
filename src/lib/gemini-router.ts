import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { MODEL_IDS, parseModelTier, type ModelTier } from "../models.js";

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

/** One model and one upstream call per request; quota retries belong to the browser. */
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
    const now = (this.options.now ?? Date.now)();
    const timeout = Math.min(59_000, (requestDeadline ?? now + 59_000) - now);
    if (timeout <= 0) throw new ModelRoutingError("SERVICE_UNAVAILABLE", "The request ran out of time before reaching Gemini. Please try again.");
    const abortSignal = AbortSignal.timeout(timeout);

    try {
      const response = await client.models.generateContent({ ...params, model, config: {
        ...params.config,
        httpOptions: { ...params.config?.httpOptions, timeout, retryOptions: { attempts: 1 } },
        abortSignal,
      } });
      const modelUsed = response.modelVersion || model;
      console.info("Gemini request completed", { tier, modelUsed });
      return { response, modelUsed };
    } catch (error) {
      if (isModelUnavailable(error)) {
        throw new ModelRoutingError("MODEL_UNAVAILABLE", `Gemini ${tier} is currently unavailable for this key. Select another model family or try again later.`);
      }
      const status = statusOf(error);
      if (abortSignal.aborted || [500, 502, 503, 504].includes(status) ||
        (status === 0 && /UNAVAILABLE|timeout|timed out|aborted/i.test(messageOf(error)))) {
        throw new ModelRoutingError("SERVICE_UNAVAILABLE", "Gemini did not respond in time or is temporarily busy. Please try again, or choose Flash-Lite.");
      }
      // Return quota and invalid-key errors immediately for the existing key rotation flow.
      throw error;
    }
  }
}

export const geminiRouter = new GeminiRouter();
// OCR always follows Flash-Lite latest, independent of generation model pins.
export const ocrRouter = new GeminiRouter({ env: { GEMINI_FLASH_LITE_MODEL: "gemini-flash-lite-latest" } });
