import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
const apiTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:7400';
const wsTarget  = process.env.VITE_WS_TARGET  ?? 'ws://localhost:7400';
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        proxy: {
            '/api': apiTarget,
            '/ws': { target: wsTarget, ws: true },
        },
    },
});
