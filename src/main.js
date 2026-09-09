import { createApp } from 'vue'
import App from './App.vue'
// Vant 全局样式（覆盖 showToast 等函数式组件的样式引入）
import 'vant/lib/index.css'
import './assets/global.css'

createApp(App).mount('#app')
