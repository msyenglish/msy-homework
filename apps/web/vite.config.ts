import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

/**
 * Publishes scripts/install.sh and install.ps1 at the site root (/install.sh, /install.ps1), so the one-line
 * install works from any running copy — including while the GitHub repository is private.
 */
function installScripts(): Plugin {
  const files = ["install.sh", "install.ps1"];
  const read = (f: string) => readFileSync(new URL(`../../scripts/${f}`, import.meta.url), "utf8");
  return {
    name: "install-scripts",
    generateBundle() {
      for (const f of files) this.emitFile({ type: "asset", fileName: f, source: read(f) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const f = files.find((x) => req.url === `/${x}`);
        if (!f) return next();
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end(read(f));
      });
    },
  };
}

const rootPkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss(), installScripts()],
  define: { __APP_VERSION__: JSON.stringify(rootPkg.version) },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Đưa /api về Worker (wrangler dev) → same-origin lúc dev (cookie chạy đúng).
    proxy: {
      "/api": {
        target: process.env.API_TARGET || "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
