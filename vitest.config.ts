import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{spec,test}.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
