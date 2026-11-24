import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Web app: http://localhost:3100   API: http://localhost:3200 (change API_PORT here and PORT in backend/.env if you move it)
const API = `http://localhost:${process.env.API_PORT || 3200}`;
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
  server: { host: true, port: 3100, strictPort: true, proxy: { '/api': { target: API, xfwd: true }, '/socket.io': { target: API, ws: true, xfwd: true } } },
  preview: { host: true, port: 3100, proxy: { '/api': { target: API, xfwd: true }, '/socket.io': { target: API, ws: true, xfwd: true } } },
});
