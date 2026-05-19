import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    // 1420 is the Tauri default; raglens (the sibling project) already
    // claims it. Shift one slot down so both can run in parallel.
    port: 1422,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1423 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
