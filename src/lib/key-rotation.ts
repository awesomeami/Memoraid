export class GenError extends Error {
  constructor(message: string, public type: "key" | "server" | "auth") {
    super(message);
  }
}

export interface KeySlot { key: string; index: number }

/** One request per configured key, preserving the body and generation ID on retries. */
export async function requestWithKeyRotation<T>({
  url, keys, startIndex, headers, body, signal, fetcher = fetch,
}: {
  url: string;
  keys: KeySlot[];
  startIndex: number;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<{ data: T; keySlotIndex: number }> {
  if (!keys.length) throw new GenError("Please configure at least one Gemini API Key in the Settings tab.", "key");
  const payload = JSON.stringify(body);
  let lastError: GenError | undefined;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const slot = keys[(Math.max(0, startIndex) + attempt) % keys.length];
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 55_000);
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "X-User-Gemini-Key": slot.key.trim() },
        body: payload, signal: controller.signal,
      });
      let data;
      try {
        data = await response.json();
      } catch {
        throw new GenError(response.status === 504 ? "The server timed out waiting for Gemini. Please try again." : "The server returned an unexpected response. Please try again.", "server");
      }
      if (!data || typeof data !== "object") throw new GenError("The server returned an invalid response.", "server");
      if (response.ok) return { data: data as T, keySlotIndex: slot.index };
      const code = data.error;
      const message = typeof data.details === "string" ? data.details : typeof code === "string" ? code : `Request failed (${response.status}).`;
      if (response.status === 401) throw new GenError("Your session expired or sign-in failed. Please sign in again.", "auth");
      if (code === "APP_RATE_LIMIT" || code === "MODEL_CONFIGURATION_ERROR") throw new GenError(message, "server");
      if (code === "MODEL_UNAVAILABLE" || code === "SERVICE_UNAVAILABLE" || response.status === 503) throw new GenError(message, "server");
      const keyFailure = response.status === 403 || response.status === 429 || code === "GEMINI_KEY_ERROR" || code === "RESOURCE_EXHAUSTED";
      if (keyFailure) {
        lastError = new GenError(`Key slot ${slot.index + 1}: ${message}`, "key");
        continue;
      }
      throw new GenError(message.includes("Firebase Admin SDK is not initialized") ? "The app's backend isn't fully configured yet. Please contact the site owner." : message, "server");
    } catch (error) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (error instanceof GenError) throw error;
      throw new GenError(controller.signal.aborted ? "The request timed out. Please try again." : "Could not connect to the server. Check your connection and try again.", "server");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
  throw new GenError(`All configured Gemini API keys failed. ${lastError?.message ?? "Please check your keys in Settings."}`, "key");
}
