import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        sandbox: resolve(__dirname, 'sandbox.html'),
        'service-worker': resolve(__dirname, 'src/service-worker/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'public/icons/*', dest: 'icons' },
        // Chrome reads the extension's name and description from _locales (see manifest.json).
        { src: 'src/i18n/locales/en.json', dest: '_locales/en', rename: 'messages.json' },
        { src: 'src/i18n/locales/ru.json', dest: '_locales/ru', rename: 'messages.json' },
      ],
    }),
  ],
});
