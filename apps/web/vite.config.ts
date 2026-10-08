import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  server: {
    port: 5173,
    // In production the ingress (or Varnish) routes /api to the API; in development Vite does.
    proxy: {
      '/api': process.env.API_INTERNAL_URL ?? 'http://localhost:4000',
    },
  },
});
