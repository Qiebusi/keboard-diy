import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "./",                       // 产物用相对路径，方便直接丢到静态服务器/子目录
  server: {
    host: "127.0.0.1",              // 避免与本机其它 dev server 撞 IPv6/IPv4
    strictPort: true,
    open: false
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1600     // three.js 体积较大，放宽告警阈值
  }
});
