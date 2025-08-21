import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: '.'
        },
        {
          src: 'background.js',
          dest: './',
        },
        {
          src: 'icon.png',
          dest: './',  // Ensure this is your correct icon file
        },
        {
          src: 'icon128.png',  // Add this line for your icon128.png file
          dest: './',  // Ensure it's copied to the root of the dist directory
        },
      ]
    })
  ],
  build: {
    rollupOptions: {
      input: {
        "inject-shadow-ui": path.resolve(__dirname, 'src/content-scripts/inject-shadow-ui.jsx'),
        "content-hh.ru-scraper": path.resolve(__dirname, 'src/content-scripts/content-hh.ru-scraper.js'),
        "content-zarplata.ru-scraper": path.resolve(__dirname, 'src/content-scripts/content-zarplata.ru-scraper.js'),
        "content-linkedin-scraper": path.resolve(__dirname, 'src/content-scripts/content-linkedin-scraper.js'),
        "content-total-counter": path.resolve(__dirname, "src/content-scripts/content-total-counter.js"),
        "content-dismissed": path.resolve(__dirname, "src/content-scripts/content-dismissed.js"),
        "content-promoted": path.resolve(__dirname, "src/content-scripts/content-promoted.js"),
        "content-applied": path.resolve(__dirname, "src/content-scripts/content-applied.js"),
        "content-viewed": path.resolve(__dirname, "src/content-scripts/content-viewed.js"),
        "content-keywords": path.resolve(__dirname, "src/content-scripts/content-keywords.js"),

        
      },
      output: {
        entryFileNames: '[name].js'
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000 // ✅ increased limit from 500 to 1000 kB
  }
});
