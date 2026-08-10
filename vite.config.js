import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Tailwind v4 via the Vite plugin, NOT the browser CDN the Sleek export
  // ships with. The export loads @tailwindcss/browser and compiles utilities
  // at runtime, which is fine for a prototype and wrong for a Capacitor app
  // that has to work offline. Compiling at build time also tree-shakes to
  // only the classes actually used.
  plugins: [react(), tailwindcss()],
});
