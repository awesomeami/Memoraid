import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.test.{ts,tsx}"], testTimeout: 10_000, restoreMocks: true },
});
