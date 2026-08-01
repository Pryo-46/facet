/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Tauri の dev サーバはこのポート固定（tauri.conf.json の devUrl と対応）。
  // 別プロセスが掴んでいたら黙って別ポートに逃げず失敗させる（アプリが白画面になるのを防ぐ）。
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    // src-tauri 配下（Rust）は Vitest の対象外
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
})
