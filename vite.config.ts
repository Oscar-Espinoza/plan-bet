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
      // One stylesheet, about 16 KB gzip / 79 KB raw. Inlining puts it in
      // the document so optimizePageHtml can prune it per page. SvelteKit
      // still emits a disabled link so Vite does not add a second, blocking
      // one; the after-first-paint callback requests the file itself. This
      // Chrome does not download a disabled stylesheet. The service worker
      // does not precache the file: install would fetch it again.
      inlineStyleThreshold: 200_000,
      serviceWorker: {
        register: true,
      },
    }),
  ],
});
