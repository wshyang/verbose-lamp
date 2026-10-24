import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Separate from vite.config.ts on purpose: the single-file and Tailwind plugins are
// irrelevant to node unit tests, and the project rule forbids editing vite.config.ts.
//
// The `@` alias IS mirrored here, because the feature-first architecture lets a feature
// reach another through its barrel, and a barrel path that cannot be resolved is a
// module that cannot be unit-tested.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
