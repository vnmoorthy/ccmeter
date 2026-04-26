import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: here,
  base: "/",
  build: {
    outDir: path.resolve(here, "../../dist/web"),
    // Some filesystems (CI, sandboxed mounts) can't unlink files Vite tries
    // to clean. Default to false; override with VITE_EMPTY_OUT=1 if needed.
    emptyOutDir: process.env.VITE_EMPTY_OUT === "1",
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: path.resolve(here, "index.html"),
      output: {
        // Split heavy charting + framework deps into their own chunks so the
        // first paint is smaller and chart-only pages can lazy-load Recharts.
        // Heavy chart deps get their own chunk so most pages can skip ~340KB.
        // Everything else (react/react-dom/scheduler/tanstack/lucide/etc.)
        // ships in the main bundle to avoid circular-chunk graph problems.
        manualChunks: (id) => {
          if (id.includes("node_modules") && (id.includes("recharts") || /node_modules[/\\]d3-/.test(id))) {
            return "charts";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:7777",
    },
  },
});
