import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "cofind",
        short_name: "cofind",
        description: "A build-in-public feed for a tiny circle of technical founders",
        theme_color: "#141c33",
        background_color: "#141c33",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell only — feed data stays network-first; never cache API responses.
        // /oauth and /.well-known are server-rendered (consent page, discovery):
        // the SW must never swallow those navigations into the SPA shell.
        navigateFallbackDenylist: [/^\/api/, /^\/mcp/, /^\/oauth/, /^\/\.well-known/],
        runtimeCaching: [],
        // Take over immediately so a reload always gets the newest shell —
        // without these a deploy leaves tabs on the stale precache.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/mcp": "http://localhost:8787",
    },
  },
});
