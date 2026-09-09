import { ref, computed } from 'vue'

const STORAGE_KEY = 'my-space-identity'

// 双人资料：展示名 + 头像 + 照片头像 + 性别主题（数据库标识仍为 user_a/user_b，不动历史数据）
// 性别映射：大椰树=girl(女生/治愈主题)，小椰宝=boy(男生/玻璃日落主题)
const PROFILES = {
  user_a: { name: '大椰树', avatar: '🌴', img: '/static/photo8.jpg', role: 'girl' },
  user_b: { name: '小椰宝', avatar: '🥥', img: '/static/photo1.jpg', role: 'boy' },
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

// 当前设备绑定的身份（可切换，见我的页 / 聊天页右上角胶囊）
export const identity = ref(resolveIdentity())

// 当前身份展示名（如 "大椰树"）
export const displayName = computed(() => ID_TO_NAME[identity.value])

// 对方身份 id
export const otherIdentity = computed(() => (identity.value === 'user_a' ? 'user_b' : 'user_a'))

// 按数据库 sender 值取昵称（兼容历史数据）
export function nameOf(sender) {
  if (PROFILES[sender]) return PROFILES[sender].name
  if (sender === '小郭') return '大椰树'
  if (sender === '黄其宏') return '小椰宝'
  return sender || ''
}
