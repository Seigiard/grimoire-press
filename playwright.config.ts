import { createHash } from "node:crypto";

import { defineConfig } from "@playwright/test";

// Derived from the checkout path so two worktrees of this repository never pick
// the same port. They otherwise would, and with `reuseExistingServer` a second
// checkout silently runs its tests against the first one's server -- green or
// red for reasons that have nothing to do with the code under test.
const PORT = 5100 + (createHash("sha1").update(process.cwd()).digest().readUInt16BE(0) % 400);

export default defineConfig({
  testDir: "./tests",
  // Unit tests for core's pure functions (tests/unit) run under Vitest, not
  // Playwright -- they need no browser. See vitest.config.ts and `npm run test`.
  testIgnore: "**/unit/**",
  fullyParallel: true,
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    // Only ever reuses a server this checkout started, since the port is its own.
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
});
