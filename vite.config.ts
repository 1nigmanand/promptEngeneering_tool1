import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    define: {
      'process.env.GEMINI_API_KEY_1': JSON.stringify(env.GEMINI_API_KEY_1),
      'process.env.GEMINI_API_KEY_2': JSON.stringify(env.GEMINI_API_KEY_2),
      'process.env.GEMINI_API_KEY_3': JSON.stringify(env.GEMINI_API_KEY_3),
      'process.env.GEMINI_API_KEY_4': JSON.stringify(env.GEMINI_API_KEY_4),
      'process.env.GEMINI_API_KEY_5': JSON.stringify(env.GEMINI_API_KEY_5),
      'process.env.GEMINI_API_KEY_6': JSON.stringify(env.GEMINI_API_KEY_6),
      'process.env.GEMINI_API_KEY_7': JSON.stringify(env.GEMINI_API_KEY_7),
      'process.env.GEMINI_API_KEY_8': JSON.stringify(env.GEMINI_API_KEY_8),
      'process.env.GEMINI_API_KEY_9': JSON.stringify(env.GEMINI_API_KEY_9),
      'process.env.GEMINI_API_KEY_10': JSON.stringify(env.GEMINI_API_KEY_10),
      'process.env.GEMINI_API_KEY_11': JSON.stringify(env.GEMINI_API_KEY_11),

      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY_1 || env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY_1 || env.GEMINI_API_KEY),

      'process.env.FIREBASE_API_KEY': JSON.stringify(env.FIREBASE_API_KEY),
      'process.env.FIREBASE_AUTH_DOMAIN': JSON.stringify(env.FIREBASE_AUTH_DOMAIN),
      'process.env.FIREBASE_PROJECT_ID': JSON.stringify(env.FIREBASE_PROJECT_ID),
      'process.env.FIREBASE_STORAGE_BUCKET': JSON.stringify(env.FIREBASE_STORAGE_BUCKET),
      'process.env.FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(env.FIREBASE_MESSAGING_SENDER_ID),
      'process.env.FIREBASE_APP_ID': JSON.stringify(env.FIREBASE_APP_ID),

      'process.env.MAX_CONCURRENT_REQUESTS': JSON.stringify(env.VITE_MAX_CONCURRENT_REQUESTS || '10'),
      'process.env.REQUESTS_PER_SECOND': JSON.stringify(env.VITE_REQUESTS_PER_SECOND || '50'),
      'process.env.CACHE_SIZE_MB': JSON.stringify(env.VITE_CACHE_SIZE_MB || '100'),
      'process.env.USER_RATE_LIMIT_PER_MINUTE': JSON.stringify(env.VITE_USER_RATE_LIMIT_PER_MINUTE || '5'),

      // 🎯 Storage API Configuration - This was missing!
      'process.env.VITE_STORAGE_API_URL': JSON.stringify(env.VITE_STORAGE_API_URL || 'https://storage.ndfreetech.me'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    server: {
      host: '0.0.0.0', // sab interfaces pe listen
      allowedHosts: [
        "*"
      ]
    }
  };
});
