import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 6000,
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter(),
      serviceWorker: {
        register: true,
      },
    }),
  ],
});
