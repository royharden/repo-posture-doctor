// Vite config for the static report viewer (src/viewer). Output: dist/. Not yet run (Dirty Mode).
// The viewer makes zero network requests; it only imports a report.json the user selects.
// Before any `vite` dev server is started, its host port must be claimed through the agent-ports skill
// (see docs/DEFERRED-VALIDATION.md); no port is fixed here.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
  },
});
