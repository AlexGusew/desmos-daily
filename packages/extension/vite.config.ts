import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync } from "fs";

export default defineConfig({
  root: "src/popup",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        content: resolve(__dirname, "src/content.ts"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  plugins: [
    (() => {
      function copyStatic() {
        mkdirSync(resolve(__dirname, "dist/icons"), { recursive: true });
        copyFileSync(
          resolve(__dirname, "manifest.json"),
          resolve(__dirname, "dist/manifest.json")
        );
        for (const file of readdirSync(resolve(__dirname, "icons"))) {
          copyFileSync(
            resolve(__dirname, "icons", file),
            resolve(__dirname, "dist/icons", file)
          );
        }
      }
      return {
        name: "copy-static",
        buildStart: copyStatic,
        closeBundle: copyStatic,
      };
    })(),
  ],
});
