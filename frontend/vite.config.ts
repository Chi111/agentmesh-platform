import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              entriesAware: true,
              includeDependenciesRecursively: false,
              minSize: 20 * 1024,
              maxSize: 400 * 1024,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Environment variable prefix, ensures VITE_ prefixed variables are available in frontend
  envPrefix: ["VITE_", "REACT_APP_"],
  // Dev server proxy config
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
