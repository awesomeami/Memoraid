/** Persist a model family, not a version that can disappear from Google's API. */
export const DEFAULT_MODEL = "flash";
export const LITE_MODEL = "flash-lite";
export const PRO_MODEL = "pro";
export type ModelTier = typeof DEFAULT_MODEL | typeof LITE_MODEL | typeof PRO_MODEL;

export const FLASH_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];

export const MODEL_IDS: Record<ModelTier, string> = {
  flash: FLASH_MODELS[0],
  "flash-lite": "gemini-flash-lite-latest",
  pro: "gemini-3.1-pro-preview",
};

export function parseModelTier(value: unknown): ModelTier | undefined {
  if (value === DEFAULT_MODEL || value === LITE_MODEL || value === PRO_MODEL) return value;
  if (typeof value !== "string") return undefined;
  // Accept old browser preferences and requests from a tab open during deployment.
  const match = value.replace(/^models\//, "").match(
    /^gemini-(?:\d+(?:\.\d+)?-)?(flash-lite|flash|pro)(?:-latest|-\d{3}|-preview(?:-[\d-]+)?)?$/,
  );
  return match?.[1] as ModelTier | undefined;
}

export function normalizeModelPreference(value: unknown): ModelTier {
  return parseModelTier(value) ?? DEFAULT_MODEL;
}

export function modelLabel(model: string): string {
  return model.replace(/^models\//, "").replace(/^gemini-/, "Gemini ").replace(/-/g, " ");
}
