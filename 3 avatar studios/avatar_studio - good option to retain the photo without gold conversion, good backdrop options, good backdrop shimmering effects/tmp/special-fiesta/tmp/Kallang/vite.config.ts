import { defineConfig } from "vite";

// Container contract (CLAUDE §10.1): port 3000 on 0.0.0.0, any forwarded host.
export default defineConfig({
  server: { host: "0.0.0.0", port: 3000, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 3000, allowedHosts: true },
});
