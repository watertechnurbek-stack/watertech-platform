import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Automatic JSX runtime for the .tsx components a hydration-safety test
  // renders with react-dom/server (tsconfig.json's "jsx": "preserve" is for
  // Next's own SWC build and leaves esbuild's default classic transform,
  // which needs a "React" global no test file imports).
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
});
