import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
        theme_color: "#0c0e12",
        background_color: "#0c0e12",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell only — feed data stays network-first; never cache API responses.
        navigateFallbackDenylist: [/^\/api/, /^\/mcp/],
        runtimeCaching: [],
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
