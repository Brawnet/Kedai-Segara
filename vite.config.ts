import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Apps Script hanya bisa menyajikan satu file HTML, jadi semua JS/CSS di-inline.
// Hasil build ditulis ke apps-script/index.html (tanpa menghapus Kode.gs).
export default defineConfig({
  root: 'src',
  plugins: [preact(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: '../apps-script',
    emptyOutDir: false,
    target: 'es2019',
  },
  server: { port: 5173 },
});
