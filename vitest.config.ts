import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["src/**/*.test.ts", "relay/**/*.test.ts", "scripts/**/*.test.mjs"] },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
