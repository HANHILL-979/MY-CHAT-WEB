import { ref, computed, watch } from 'vue'
import { identity } from './identity'

// 双主题系统：
// female = 治愈系 · 云端呼吸（大椰树）/ male = 日落玻璃 · 苹果质感（小椰宝）
const STORAGE_KEY = 'user_gender_v2'

function resolveTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'male' || stored === 'female') return stored
  // 默认跟随身份：大椰树(user_a) → 女性视角，小椰宝(user_b) → 男性视角
  return identity.value === 'user_a' ? 'female' : 'male'
}

export const theme = ref(resolveTheme())

export const isMale = computed(() => theme.value === 'male')

export function setTheme(value) {
  if (value !== 'male' && value !== 'female') return
  theme.value = value
  localStorage.setItem(STORAGE_KEY, value)
}

// 切换身份时主题跟随身份
watch(identity, (v) => setTheme(v === 'user_a' ? 'female' : 'male'))
