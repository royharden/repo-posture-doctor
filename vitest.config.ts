// Vitest config. Not yet run (Dirty Mode). Default environment is node; viewer tests opt into jsdom with a
// `// @vitest-environment jsdom` docblock. test/setup/no-network.ts (M2, K17) replaces globalThis.fetch,
// XMLHttpRequest, WebSocket, http.request, https.request, net.connect and tls.connect with throwing spies.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['node_modules/**', 'corpus/.out/**', 'corpus/heldout/**', 'dist/**', 'dist-cli/**'],
    setupFiles: ['test/setup/no-network.ts'],
    globals: false,
  },
});
