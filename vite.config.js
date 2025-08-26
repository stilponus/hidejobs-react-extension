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

        "content-linkedin-scraper": path.resolve(__dirname, 'src/content-scripts/linkedin-content/content-linkedin-scraper.js'),
        "content-total-counter": path.resolve(__dirname, "src/content-scripts/linkedin-content/content-total-counter.js"),
        "content-dismissed": path.resolve(__dirname, "src/content-scripts/linkedin-content/content-dismissed.js"),
        "content-promoted": path.resolve(__dirname, "src/content-scripts/linkedin-content/content-promoted.js"),
        "content-applied": path.resolve(__dirname, "src/content-scripts/linkedin-content/content-applied.js"),
        "content-viewed": path.resolve(__dirname, "src/content-scripts/linkedin-content/content-viewed.js"),
        "content-keywords": path.resolve(__dirname, "src/content-scripts/linkedin-content/content-keywords.js"),
        "content-hours-patch": path.resolve(__dirname, "src/content-scripts/linkedin-content/content-hours-patch.js"),
        "content-companies": path.resolve(__dirname, "src/content-scripts/linkedin-content/content-companies.js"),

        "content-applied-indeed": path.resolve(__dirname, "src/content-scripts/indeed-content/content-applied-indeed.js"),
        "content-sponsored-indeed": path.resolve(__dirname, "src/content-scripts/indeed-content/content-sponsored-indeed.js"),
        "content-companies-indeed": path.resolve(__dirname, "src/content-scripts/indeed-content/content-companies-indeed.js"),
        "content-keywords-indeed": path.resolve(__dirname, "src/content-scripts/indeed-content/content-keywords-indeed.js"),
        "content-total-counter-indeed": path.resolve(__dirname, "src/content-scripts/indeed-content/content-total-counter-indeed.js"),
        

        "content-keywords-glassdoor": path.resolve(__dirname, "src/content-scripts/glassdoor-content/content-keywords-glassdoor.js"),
        "content-applied-glassdoor": path.resolve(__dirname, "src/content-scripts/glassdoor-content/content-applied-glassdoor.js"),
        "content-companies-glassdoor": path.resolve(__dirname, "src/content-scripts/glassdoor-content/content-companies-glassdoor.js"),
        "content-total-counter-glassdoor": path.resolve(__dirname, "src/content-scripts/glassdoor-content/content-total-counter-glassdoor.js"),
      },
      output: {
        entryFileNames: '[name].js'
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500 // ✅ increased limit from 500 to 1000 kB
  }
});
