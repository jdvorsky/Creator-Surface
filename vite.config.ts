import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react") || id.includes("scheduler")) return "vendor-react";
          if (
            id.includes("@codemirror") ||
            id.includes("@uiw") ||
            id.includes("@lezer") ||
            id.includes("codemirror") ||
            id.includes("crelt") ||
            id.includes("style-mod") ||
            id.includes("w3c-keyname")
          ) {
            return "vendor-editor";
          }
          if (id.includes("lucide")) return "vendor-icons";
          if (id.includes("immer") || id.includes("react-resizable-panels") || id.includes("zod") || id.includes("zustand")) {
            return "vendor-state";
          }
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    css: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
