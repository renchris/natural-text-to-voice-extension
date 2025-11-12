import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: './public/manifest.json',
      watchFilePaths: ['public/**/*', 'src/**/*'],
      additionalInputs: [
        'src/popup/popup.html',
        'src/options/options.html',
        'src/offscreen/offscreen.html',
        'src/background/service-worker.ts',
        'src/content/content-script.ts',
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssMinify: 'lightningcss',  // Enable CSS minification
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        options: resolve(__dirname, 'src/options/options.html'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content-script': resolve(__dirname, 'src/content/content-script.ts'),
      },
    },
    // Optimize for extension bundle size
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // Remove console.logs in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.warn'],
        passes: 2,  // Multiple passes for better compression
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false,  // Remove all comments
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
