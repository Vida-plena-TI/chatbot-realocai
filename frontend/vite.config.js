import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_PROXY_TARGET (opcional): encaminha /api para o Django no dev,
// deixando front e API na mesma origem (útil para cookies de sessão e CSRF).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: env.VITE_PROXY_TARGET
        ? { '/api': { target: env.VITE_PROXY_TARGET, changeOrigin: true } }
        : undefined,
    },
  };
});
