import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps the built site relocatable (served from any subpath or file host).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", chunkSizeWarningLimit: 4000 },
});
