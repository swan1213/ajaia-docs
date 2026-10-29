import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev the API runs separately on :8000
    proxy: { "/api": "http://localhost:8000" },
  },
  build: { outDir: "dist" },
});
