import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const localModelRuntime = env.VITE_ENABLE_EXPERIMENTAL_PROVIDERS === 'true'
    ? './src/store/slices/localModelSlice.ts'
    : './src/store/slices/localModelRuntime.ts';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || '0.1.1'),
    },
    resolve: {
      alias: [
        {
          find: '@/store/slices/localModelRuntime',
          replacement: path.resolve(__dirname, localModelRuntime),
        },
        {
          find: '@',
          replacement: path.resolve(__dirname, './src'),
        },
      ],
    },
    clearScreen: false,
    server: {
      port: 8080,
      strictPort: true,
      host: '0.0.0.0',
      allowedHosts: true,
      hmr: host
        ? {
            protocol: 'ws',
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
  };
});
