import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH || "/Mase/";
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "icons/*.png",
        "favicon.svg",
        "fonts/*.ttf",
        "fonts/*.otf",
        "fonts/*OFL.txt",
      ],
      manifest: {
      name: "Mase — UA weekly schedules",
        short_name: "Mase",
      description: "Upload the UA weekly workbook and download branded schedule images, with private studio tools alongside.",
        theme_color: "#354b3d",
        background_color: "#f7f6f2",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,mjs,css,html,woff2,ttf,otf,pfb,bcmap,png,svg,webmanifest}",
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: `${base}index.html`,
        // Precache application assets only. Private uploads never become network requests.
        runtimeCaching: [],
      },
    }),
  ],
  build: { target: "es2020", chunkSizeWarningLimit: 1800 },
});
