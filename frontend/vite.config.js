import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target:      'http://localhost:3000',
        changeOrigin: true,
        secure:       false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor React core
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
          // Recharts isolé (lourd)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory-')) {
            return 'vendor-charts';
          }
          // Sonner (toasts)
          if (id.includes('node_modules/sonner')) {
            return 'vendor-sonner';
          }
          // Vues planning (les plus lourdes)
          if (id.includes('/views/PlanningView') || id.includes('/views/TeamPlanningView') || id.includes('/views/GeneralPlanningView') || id.includes('/views/MonPlanningView')) {
            return 'views-planning';
          }
          // Vues admin
          if (id.includes('/views/ConfigView') || id.includes('/views/EquipeView') || id.includes('/views/StatsView') || id.includes('/views/CostsView')) {
            return 'views-admin';
          }
        },
      },
    },
  },
});
