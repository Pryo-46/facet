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
  build: {
    // フォントを data URI にインライン化しない。JP の woff2 には 4KB 未満の
    // スライスが 24 本あり、既定の assetsInlineLimit(4096) だと CSS 内の
    // data: URI になる——CSP の font-src は 'self' だけ（data: 無し）なので、
    // そのスライスだけ静かにブロックされ、珍しい漢字が豆腐になる。
    // CSP を緩める側ではなくインライン化を止める側で塞ぐ
    assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? false : undefined),
  },
  test: {
    // src-tauri 配下（Rust）は Vitest の対象外。
    // scripts/ はリリース補助スクリプト（M19）。src/ の下に置けないので
    // 走査対象を明示して足す
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
})
