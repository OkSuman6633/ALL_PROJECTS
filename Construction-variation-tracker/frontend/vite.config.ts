import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: {
    proxy: {
      "/v1": process.env.VITE_API_URL || "http://127.0.0.1:8000",
      "/healthz": process.env.VITE_API_URL || "http://127.0.0.1:8000",
    },
  },
});
