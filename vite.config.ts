import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"]
  },
  preview: {
    allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"]
  }
});
