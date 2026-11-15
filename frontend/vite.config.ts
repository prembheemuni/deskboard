import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In development the page runs on Vite (5173) and /api goes to the FastAPI backend (8787).
// In production the backend serves the built dist/ itself, so it's all one origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8787" },
    },
  },
});
