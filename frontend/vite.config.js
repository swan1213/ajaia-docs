import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app only ever calls same-origin /api/... from the browser.
// - On Vercel, the top-level rewrite in vercel.json sends /api/* to the backend service.
// - With `vercel dev`, Vercel does the same routing locally.
// - With plain `npm run dev`, this proxy forwards /api to a backend you started yourself.
const apiTarget = process.env.API_PROXY_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": apiTarget },
  },
  build: { outDir: "dist" },
});
