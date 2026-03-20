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
    {
      name: "copy-manifest",
      closeBundle() {
        copyFileSync(
          resolve(__dirname, "manifest.json"),
          resolve(__dirname, "dist/manifest.json")
        );
        const iconsSource = resolve(__dirname, "icons");
        const iconsDest = resolve(__dirname, "dist/icons");
        mkdirSync(iconsDest, { recursive: true });
        for (const file of readdirSync(iconsSource)) {
          copyFileSync(
            resolve(iconsSource, file),
            resolve(iconsDest, file)
          );
        }
      },
    },
  ],
});
