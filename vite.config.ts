import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    // Framework code changes rarely; keeping it in its own chunks lets
    // returning players reuse it from cache while the game code updates.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: "motion", test: /node_modules[\\/]motion/ },
            { name: "icons", test: /node_modules[\\/]@phosphor-icons/ },
            { name: "card-data", test: /src[\\/]data[\\/]/ },
          ],
        },
      },
    },
  },
});
