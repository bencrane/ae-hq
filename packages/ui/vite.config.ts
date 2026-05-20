import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // No aliases — workspace symlinks + the @ae-hq/tokens package.json `exports`
  // field handles `@ae-hq/tokens` and `@ae-hq/tokens/css` directly.
});
