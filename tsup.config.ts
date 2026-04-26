import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli/index.ts",
  },
  outDir: "dist",
  format: ["esm"],
  target: "node20",
  platform: "node",
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: false,
  minify: false,
  treeshake: true,
  external: [],
  noExternal: [
    "commander",
    "picocolors",
    "cli-table3",
    "cli-progress",
    "asciichart",
    "zod",
  ],
});
