import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from '@vant/auto-import-resolver'

export default defineConfig({
  plugins: [
    vue(),
    // Vant 组件按需引入
    Components({
      resolvers: [VantResolver()],
    }),
  ],
  build: {
    outDir: 'dist',
  },
})
