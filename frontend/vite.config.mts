import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import Pages from 'vite-plugin-pages';
import { uiControlPlugin } from './plugins/vite-plugin-ui-control';

// `__dirname` does not exist under ESM; this file is `.mts`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const r = (p: string) => path.resolve(__dirname, p);

/**
 * The OceanBase SQL language workers are prebuilt files inside node_modules that
 * `ob-plugin.ts` fetches by URL at runtime. Webpack's CopyPlugin used to place
 * them under the served static dir; Vite serves `public/`, so mirror them there.
 * They are ~75MB and never change, so copy only what is missing.
 */
function copyObWorkers(): Plugin {
  return {
    name: 'copy-ob-workers',
    buildStart() {
      const from = r('node_modules/@oceanbase-odc/monaco-plugin-ob/worker-dist');
      const to = r('public/ob-workers');
      if (!fs.existsSync(from)) return;
      fs.mkdirSync(to, { recursive: true });
      for (const file of fs.readdirSync(from)) {
        if (!file.endsWith('.js')) continue;
        const dest = path.join(to, file);
        if (!fs.existsSync(dest)) fs.copyFileSync(path.join(from, file), dest);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  return {
    plugins: [
      tailwindcss(),
      react(),
      Pages({ dirs: 'pages', extensions: ['tsx'], routeStyle: 'next' }),
      copyObWorkers(),
      uiControlPlugin(),
    ],
    resolve: {
      alias: {
        // The six Next modules the app imports, backed by react-router. See shims/.
        'next/router': r('shims/next-router.tsx'),
        'next/navigation': r('shims/next-navigation.tsx'),
        'next/image': r('shims/next-image.tsx'),
        'next/link': r('shims/next-link.tsx'),
        'next/head': r('shims/next-head.tsx'),
        'next/dynamic': r('shims/next-dynamic.tsx'),
        '@': r('.'),
        // Node builtin pulled in by antlr4 but never reached in the browser.
        fs: r('shims/empty-fs.ts'),
      },
    },
    define: {
      // 33 call sites read process.env.API_BASE_URL. Replacing the expression is
      // what lets them stay unchanged; next.config.js did the same thing.
      'process.env.API_BASE_URL': JSON.stringify(env.API_BASE_URL ?? ''),
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
      // Catch-all so a stray `process.env.X` reads undefined instead of throwing
      // "process is not defined". Vite prefers the longest matching key, so the
      // two specific entries above still win.
      'process.env': '({})',
    },
    optimizeDeps: {
      // next-transpile-modules handled these; they ship untranspiled ESM.
      // The chat route is lazily imported, so vite's cold-start scan never sees
      // its dependency subtree. Discovering them on first navigation restarts the
      // optimizer mid-flight and the in-flight dynamic import 404s. Pre-declare
      // everything components/chat/lines/ pulls in so the scan is complete.
      include: [
        '@berryv/g2-react',
        '@antv/g2',
        '@antv/g6',
        '@antv/graphin',
        '@antv/gpt-vis',
        'copy-to-clipboard',
        'framer-motion',
        'sonner',
      ],
    },
    server: {
      port: 3000,
      watch: {
        usePolling: true,
        interval: 1000,
      },
      proxy: {
        '/api/agent_wrap': {
          target: 'http://160.191.50.138:8787',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/agent_wrap/, ''),
          headers: {
            ...(env.AGENT_WRAP_API_KEY ? { Authorization: `Bearer ${env.AGENT_WRAP_API_KEY}` } : {}),
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const key = env.AGENT_WRAP_API_KEY || '';
              if (!req.headers['authorization'] && key) {
                proxyReq.setHeader('Authorization', `Bearer ${key.trim()}`);
              }
            });
          },
        },
        '/api/agent-wrap': {
          target: 'http://160.191.50.138:8787',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/agent-wrap/, ''),
          headers: {
            ...(env.AGENT_WRAP_API_KEY ? { Authorization: `Bearer ${env.AGENT_WRAP_API_KEY}` } : {}),
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const key = env.AGENT_WRAP_API_KEY || '';
              if (!req.headers['authorization'] && key) {
                proxyReq.setHeader('Authorization', `Bearer ${key.trim()}`);
              }
            });
          },
        },
        '/api/deepseek': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/deepseek/, ''),
          headers: {
            ...(env.DEEPSEEK_API_KEY || env.VITE_DEEPSEEK_API_KEY
              ? { Authorization: `Bearer ${env.DEEPSEEK_API_KEY || env.VITE_DEEPSEEK_API_KEY}` }
              : {}),
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const key = env.DEEPSEEK_API_KEY || env.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '';
              if (!req.headers['authorization'] && key) {
                proxyReq.setHeader('Authorization', `Bearer ${key.trim()}`);
              }
            });
          },
        },
        '/api/openrouter': {
          target: 'https://openrouter.ai/api',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openrouter/, ''),
          headers: {
            'HTTP-Referer': 'https://dbgpt.site',
            'X-Title': 'DB-GPT OpenWork Coworker',
            ...(env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY
              ? { Authorization: `Bearer ${env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY}` }
              : {}),
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const key = env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY || '';
              if (!req.headers['authorization'] && key) {
                proxyReq.setHeader('Authorization', `Bearer ${key.trim()}`);
              }
              proxyReq.setHeader('HTTP-Referer', 'https://dbgpt.site');
              proxyReq.setHeader('X-Title', 'DB-GPT OpenWork Coworker');
            });
          },
        },
        '/api': {
          target: 'http://127.0.0.1:5670',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              if (res && !('headersSent' in res && res.headersSent)) {
                res.writeHead(200, {
                  'Content-Type': 'application/json',
                  'X-Mock-Fallback': 'true',
                });
                res.end(
                  JSON.stringify({ success: true, ok: true, data: [], err_code: null, err_msg: null })
                );
              }
            });
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@oceanbase-odc')) {
                return 'ob-parser';
              }
              if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
                return 'monaco-editor';
              }
              if (id.includes('@antv') || id.includes('@berryv/g2-react')) {
                return 'antv-vendor';
              }
              if (id.includes('antd') || id.includes('@ant-design')) {
                return 'antd-vendor';
              }
              if (id.includes('lodash')) {
                return 'lodash-vendor';
              }
              if (id.includes('xlsx')) {
                return 'xlsx-vendor';
              }
              if (id.includes('sql-formatter')) {
                return 'sql-formatter-vendor';
              }
            }
          },
        },
      },
    },
  };
});
