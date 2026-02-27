import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Codevv",
        short_name: "Codevv",
        description: "Collaborative software design platform",
        theme_color: "#00AFB9",
        background_color: "#0a0e14",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/api\/.*/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["codevv.streamy.tube"],
    proxy: {
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
      "/workspace-proxy": {
        target: "http://backend:8000",
        changeOrigin: true,
        ws: true,
      },
      "/ws": {
        target: "http://backend:8000",
        changeOrigin: true,
        ws: true,
      },
      "/connect": {
        target: "http://yjs-server:1234",
        changeOrigin: true,
        ws: true,
      },
      "/callback": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});
