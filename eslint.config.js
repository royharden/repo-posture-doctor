// ESLint flat config. Not yet run (Dirty Mode; see docs/DEFERRED-VALIDATION.md).
// Uses only the declared devDependencies `eslint` and `typescript-eslint`.
import tseslint from 'typescript-eslint';

// Node built-ins and network/process modules that no pure-core file may import ([C] §3 item 3, PLAN.md §3, K17).
const NODE_IO_MODULES = [
  'fs', 'fs/promises', 'path', 'os', 'child_process', 'http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns',
  'crypto', 'url', 'process', 'worker_threads', 'cluster', 'module', 'vm', 'stream', 'readline', 'inspector',
];
const NETWORK_AND_PROCESS_MODULES = ['child_process', 'http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns', 'cluster', 'worker_threads'];

const asNodeBoth = (names) => names.flatMap((n) => [n, `node:${n}`]);

const networkGlobals = [
  { name: 'fetch', message: 'No network: fetch is banned here (PLAN.md §3, K17).' },
  { name: 'XMLHttpRequest', message: 'No network (K17).' },
  { name: 'WebSocket', message: 'No network (K17).' },
  { name: 'EventSource', message: 'No network (K17).' },
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-cli/**',
      'out/**',
      'corpus/.out/**',
      'corpus/heldout/**',
      // Byte-for-byte copies: never edited, so lint findings in them cannot be fixed (PLAN.md K16, M3).
      'baselines/b1-vca13/supabase/**',
      'src/shared/vendored/rng.ts',
      'src/shared/vendored/wilson.ts',
      'src/shared/vendored/entropy.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Pure core: imports only relative modules and `typescript` (PLAN.md M0, r1 B9). No I/O, clock, randomness or network.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: asNodeBoth(NODE_IO_MODULES).map((name) => ({ name, message: 'src/core is pure: no Node I/O or network modules.' })),
        patterns: [
          { group: ['node:*'], message: 'src/core is pure: no node:* imports.' },
          { regex: '^(?!\\.{1,2}/|typescript$)', message: 'src/core may import only relative modules and `typescript`.' },
        ],
      }],
      'no-restricted-globals': ['error',
        ...networkGlobals,
        { name: 'process', message: 'src/core is pure: no process access.' },
        { name: 'require', message: 'ESM only.' },
      ],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date']", message: 'No clock in src/core (byte-identical output).' },
        { selector: "MemberExpression[object.name='Date']", message: 'No clock in src/core.' },
        { selector: "MemberExpression[object.name='Math'][property.name='random']", message: 'No randomness in src/core.' },
        { selector: "MemberExpression[object.name='performance']", message: 'No clock in src/core.' },
      ],
    },
  },
  {
    // CLI: reads the local folder only; never spawns subprocesses and never opens sockets (PLAN.md §3, K17).
    files: ['src/cli/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: asNodeBoth(NETWORK_AND_PROCESS_MODULES).map((name) => ({ name, message: 'CLI: no subprocesses, no network.' })),
      }],
      'no-restricted-globals': ['error', ...networkGlobals],
    },
  },
  {
    // Viewer: zero network requests, text-only rendering (PLAN.md M4).
    files: ['src/viewer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', ...networkGlobals],
      'no-restricted-syntax': ['error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Render report data as text only.' },
        { selector: "MemberExpression[property.name='innerHTML']", message: 'Render report data as text only.' },
      ],
    },
  },
);
