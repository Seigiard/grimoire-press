import { defineConfig } from "vitest/config";

// Unit tests for core's pure functions live under tests/unit, kept out of
// Playwright's browser suite (see playwright.config.ts's testIgnore) since these
// need no browser at all -- parseBook is plain, browser-free TypeScript.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.spec.ts"],
  },
});
