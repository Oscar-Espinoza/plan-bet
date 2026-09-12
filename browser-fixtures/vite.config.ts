import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  publicDir: path.resolve(import.meta.dirname, "../public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../src"),
      "next/navigation": path.resolve(import.meta.dirname, "navigation.tsx"),
      "next/link": path.resolve(import.meta.dirname, "link.tsx"),
    },
  },
  server: { host: "127.0.0.1", port: 3101, strictPort: true },
});
