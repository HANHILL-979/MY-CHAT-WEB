import { ref, computed } from 'vue'

const STORAGE_KEY = 'my-space-identity'

// 双人资料：展示名 + 头像（数据库标识仍为 user_a/user_b，不动历史数据）
const PROFILES = {
  user_a: { name: '大椰树', avatar: '🌴' },
  user_b: { name: '小椰宝', avatar: '🥥' },
}
const ID_TO_NAME = {
  user_a: '大椰树',
  user_b: '小椰宝',
}
// 旧版姓名作为别名兼容：历史绑定链接（?user=小郭 / ?user=黄其宏）依然有效
const NAME_TO_ID = {
  大椰树: 'user_a',
  小椰宝: 'user_b',
  小郭: 'user_a',
  黄其宏: 'user_b',
}

export const identityNames = ID_TO_NAME
export const identityProfiles = PROFILES

// 首次打开时解析设备身份：URL 参数优先，其次本机绑定，最后回退默认
function resolveIdentity() {
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('user')
  if (fromUrl && NAME_TO_ID[fromUrl]) {
    localStorage.setItem(STORAGE_KEY, NAME_TO_ID[fromUrl])
    // 绑定完成后移除 URL 中的身份参数，避免后续分享链接时泄露
    params.delete('user')
    const query = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${query ? '?' + query : ''}`)
    return NAME_TO_ID[fromUrl]
  }

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'user_a' || stored === 'user_b') return stored

  localStorage.setItem(STORAGE_KEY, 'user_a')
  return 'user_a'
}

// 当前设备绑定的身份（已锁定，不再提供切换 UI）
export const identity = ref(resolveIdentity())

// 当前身份展示名（如 "大椰树"）
export const displayName = computed(() => ID_TO_NAME[identity.value])
