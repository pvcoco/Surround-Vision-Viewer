import { defineConfig } from "vite";

// Relative base so the build works from any static host sub-path and from file:// in Electron.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
});
