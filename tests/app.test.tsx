// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  save: vi.fn(async () => {}),
  user: { uid: "review-user", isAnonymous: false, displayName: "Reviewer", getIdToken: async () => "test-token" },
}));
vi.mock("../src/lib/firebase", () => ({
  auth: {}, googleProvider: {},
  onAuthStateChanged: (_auth: unknown, callback: any) => { let active = true; queueMicrotask(() => active && callback(mocks.user)); return () => { active = false; }; },
  signOut: vi.fn(), signInWithPopup: vi.fn(), signInAnonymously: vi.fn(),
}));
vi.mock("../src/lib/db", () => ({
  getUserMnemonics: async () => [], getUserFavorites: async () => [], migrateLocalToFirestore: async () => [],
  saveUserMnemonic: mocks.save, deleteUserMnemonic: vi.fn(), deleteAllUserMnemonics: vi.fn(),
  clearAllUserFavorites: vi.fn(), deleteNonFavoriteUserMnemonics: vi.fn(),
}));
// JSDOM has no layout/paint lifecycle; test UI behavior without waiting on exit animations.
vi.mock("motion/react", async importOriginal => ({
  ...await importOriginal<typeof import("motion/react")>(),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));
import App from "../src/App";

const details = { mnemonic: "TEST", strategyUsed: "Acronym", expansion: [{ letter: "T", concept: "Test fact", details: "Fixture explanation" }], whyItWorks: "Fixture rationale", memorabilityScore: 8 };
const guide = { bestMnemonic: details, alternativeMnemonics: [{ ...details, mnemonic: "ALT" }], modelUsed: "gemini-3.8-flash" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  localStorage.clear();
  mocks.save.mockClear();
  localStorage.setItem("medmnemonic_selected_model", "gemini-3.6-flash");
  localStorage.setItem("medmnemonic_gemini_keys::review-user", JSON.stringify(["key-a", "", "key-c", "", ""]));
  fetcher = vi.fn<typeof fetch>().mockImplementation(async url => {
    if (url === "/api/health") return json({ firebaseAdminInitialized: true, firestoreReachable: true });
    return json(guide);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("model selection in the real React app", () => {
  it("migrates stale preferences, rotates keys, renders a study guide, persists it, and keeps history/favorites/navigation", async () => {
    let attempts = 0;
    fetcher.mockImplementation(async url => {
      if (url === "/api/health") return json({ firebaseAdminInitialized: true, firestoreReachable: true });
      if (++attempts === 1) return json({ error: "RESOURCE_EXHAUSTED" }, 429);
      return json(guide);
    });
    render(<App />);
    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Fixture clinical notes" } });
    fireEvent.click(screen.getByRole("button", { name: /Convert to Mnemonic/i }));
    await screen.findByText(/Generated using Key Slot 3/);
    expect(localStorage.getItem("medmnemonic_selected_model")).toBe("flash");
    expect(localStorage.getItem("medmnemonic_gemini_key_index::review-user")).toBe("2");
    const requests = fetcher.mock.calls.filter(([url]) => url === "/api/mnemonic/generate");
    expect(requests).toHaveLength(2);
    expect(JSON.parse(requests[0][1]!.body as string).selectedModel).toBe("flash");
    expect((requests[0][1]!.headers as Record<string, string>)["X-Generation-ID"]).toBe((requests[1][1]!.headers as Record<string, string>)["X-Generation-ID"]);
    expect(mocks.save).toHaveBeenCalledWith("review-user", expect.objectContaining({ ...guide, medicalText: "Fixture clinical notes" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to Favorites" }));
    await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith("review-user", expect.objectContaining({ isFavorite: true })));
    fireEvent.click(screen.getAllByRole("button", { name: /History/ })[0]);
    await screen.findByText("Mnemonic History");
    await screen.findByText("TEST");
    fireEvent.click(screen.getAllByRole("button", { name: /Favorites/ })[0]);
    await screen.findByText("Saved Favorites");
    expect(screen.getByText("TEST")).toBeTruthy();
  });
  it("sends the selected Lite family and restores it after remount", async () => {
    const first = render(<App />);
    const input = await screen.findByRole("textbox");
    fireEvent.click(screen.getByRole("button", { name: /Flash Lite/ }));
    fireEvent.change(input, { target: { value: "Fixture notes" } });
    fireEvent.click(screen.getByRole("button", { name: /Convert to Mnemonic/ }));
    await screen.findByText(/Generated using Key Slot 1/);
    const request = fetcher.mock.calls.find(([url]) => url === "/api/mnemonic/generate")!;
    expect(JSON.parse(request[1]!.body as string).selectedModel).toBe("flash-lite");
    first.unmount(); render(<App />);
    await screen.findByRole("textbox");
    expect(localStorage.getItem("medmnemonic_selected_model")).toBe("flash-lite");
  });
  it("surfaces provider error details without falsely blaming saved keys", async () => {
    fetcher.mockImplementation(async url => url === "/api/health" ? json({ firebaseAdminInitialized: true, firestoreReachable: true }) : json({ error: "MODEL_UNAVAILABLE", details: "No Flash model is currently accessible. Try Flash-Lite." }, 503));
    render(<App />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Fixture notes" } });
    fireEvent.click(screen.getByRole("button", { name: /Convert to Mnemonic/ }));
    await screen.findByText("No Flash model is currently accessible. Try Flash-Lite.");
    expect(screen.queryByText("Gemini Key or Quota Limit Hit")).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
