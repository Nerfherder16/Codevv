import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
      "/callback": {
        target: "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});
