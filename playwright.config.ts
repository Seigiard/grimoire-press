import { defineConfig } from "@playwright/test";

const PORT = 5183;

export default defineConfig({
  testDir: "./tests",
  // Unit tests for core's pure functions (tests/unit) run under Vitest, not
  // Playwright -- they need no browser. See vitest.config.ts and `npm run test`.
  testIgnore: "**/unit/**",
  fullyParallel: true,
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
});
