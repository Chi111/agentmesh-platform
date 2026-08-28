import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { BRAND } from "../shared/brand.ts";

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function brandManifest() {
  return JSON.stringify({
    name: BRAND.platform.name,
    short_name: BRAND.platform.name,
    description: BRAND.platform.metaDescription,
    start_url: '/#/dashboard',
    display: 'standalone',
    background_color: '#F4F5F1',
    theme_color: '#0D1117',
    icons: [{
      src: '/pinme-mesh-mark.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any maskable',
    }],
  }, null, 2);
}

const brandHtmlPlugin: Plugin = {
  name: 'brand-html',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      return html
        .replaceAll('__BRAND_DOCUMENT_TITLE__', escapeHtml(BRAND.platform.documentTitle))
        .replaceAll('__BRAND_META_DESCRIPTION__', escapeHtml(BRAND.platform.metaDescription))
        .replaceAll('__BRAND_PLATFORM_NAME__', escapeHtml(BRAND.platform.name));
    },
  },
};

const brandManifestPlugin: Plugin = {
  name: 'brand-manifest',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== '/site.webmanifest') return next();
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      response.end(brandManifest());
    });
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'site.webmanifest', source: brandManifest() });
  },
};

export default defineConfig({
  plugins: [brandHtmlPlugin, brandManifestPlugin, react()],
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
