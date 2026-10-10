import { defineConfig, loadEnv } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const configDir = dirname(fileURLToPath(import.meta.url));
  const env = loadEnv(mode, configDir, 'VITE_');
  const { PORT: apiPort } = loadEnv(mode, resolve(configDir, '../api'), 'PORT');
  const apiTarget = (env.VITE_API_PROXY_TARGET || env.VITE_API_URL || `http://localhost:${apiPort || 5000}`)
    .replace(/\/api\/?$/, '')
    .replace(/\/+$/, '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': apiTarget,
      },
    },
  };
});
