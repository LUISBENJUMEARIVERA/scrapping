import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiUrl = env.VITE_API_URL || "http://127.0.0.1:8000";
  const parsedPort = Number.parseInt(env.VITE_PORT || "5173", 10);
  const serverPort = Number.isNaN(parsedPort) ? 5173 : parsedPort;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: serverPort,
      strictPort: false,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
