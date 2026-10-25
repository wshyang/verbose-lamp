import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // The dev server also runs inside a hosted preview, which reaches it through
  // a proxied host name rather than localhost. Vite rejects unknown Host
  // headers by default, so allow the sandbox preview suffix explicitly.
  server: {
    allowedHosts: [".e2b.app"],
  },
  preview: {
    allowedHosts: [".e2b.app"],
  },
});
