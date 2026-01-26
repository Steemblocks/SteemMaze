import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("three")) {
              return "vendor-three";
            }
            if (id.includes("cannon")) {
              return "vendor-physics";
            }
            if (id.includes("gsap")) {
              return "vendor-gsap";
            }
            if (id.includes("steem")) {
              return "vendor-steem";
            }
            return "vendor"; // all other vendors
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
