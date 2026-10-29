import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // In development the screens come from Vite and the API from the facility server.
  server: {
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  // The 3D engine (three.js) is one ~630 kB chunk, loaded from this Mac on demand.
  build: { chunkSizeWarningLimit: 700 },
});
