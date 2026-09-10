import { defineConfig } from "@playwright/test";

const PORT = 5183;

export default defineConfig({
  testDir: "./tests",
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
