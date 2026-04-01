import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 4173,
    host: "0.0.0.0"
  },
  build: {
    target: "es2018",
    chunkSizeWarningLimit: 1500
  }
});
