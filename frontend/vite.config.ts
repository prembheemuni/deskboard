import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The build is a single self-contained index.html (JS + CSS inlined),
// so it can be opened by double-clicking it, without a server.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
});
