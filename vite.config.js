import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  esbuild: {
    drop: ["debugger"],
    pure: ["console.log", "console.debug"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
          if (/node_modules\/(socket\.io-client|engine\.io-client|socket\.io-parser|engine\.io-parser|@socket\.io)\//.test(id)) return "socket-vendor";
          return undefined;
        },
      },
    },
  },
});