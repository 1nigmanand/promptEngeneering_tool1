import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// Vite dev server URL
const target = 'http://localhost:5173';

// Proxy all requests to Vite
app.use(
  '/',
  createProxyMiddleware({
    target,
    changeOrigin: true,       // ✅ rewrite Host header to target
    ws: true,                  // enable WebSocket (for HMR)
  })
);

// Run proxy on port 3001 (or any free port)
app.listen(3001, () => {
  console.log('Proxy running on http://localhost:3001');
});
