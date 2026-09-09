// 时间处理工具（复刻 Linda1 的时间容错逻辑）

// 宽容解析时间戳：数字 / 数字字符串 / 日期字符串 / Date / {$date} 均可
export function getTimestamp(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (!Number.isNaN(numeric) && value.trim() !== '') {
      return numeric < 1e12 ? numeric * 1000 : numeric
    }
    // 先按 ISO 8601 原样解析（Supabase created_at 形如 2026-09-09T19:19:45+00:00）
    const iso = Date.parse(value)
    if (!Number.isNaN(iso)) return iso
    // 兼容 "YYYY-MM-DD HH:mm:ss" 旧格式（部分浏览器不支持短横线日期）
    const legacy = Date.parse(value.replace(/-/g, '/'))
    return Number.isNaN(legacy) ? 0 : legacy
  }
  if (typeof value === 'object') {
    if (typeof value.getTime === 'function') return value.getTime()
    if (value.$date) return getTimestamp(value.$date)
    if (typeof value.toDate === 'function') return value.toDate().getTime()
  }
  return 0
}

// 聊天气泡时间：HH:MM
export function formatTime(value) {
  const ts = getTimestamp(value)
  if (!ts) return ''
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  const hh = `${date.getHours()}`.padStart(2, '0')
  const mm = `${date.getMinutes()}`.padStart(2, '0')
  return `${hh}:${mm}`
}

// 朋友圈时间归一化：刚刚 / N分钟前 / 今天 HH:MM / 昨天 HH:MM / N月N日 / 年月日
export function formatMomentTime(timestamp) {
  if (!timestamp) return ''
  const now = Date.now()
  const diff = now - timestamp
  const date = new Date(timestamp)

  if (diff >= 0 && diff < 60000) return '刚刚'
  if (diff >= 0 && diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`

  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const today = new Date(now)

  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return `今天 ${hours}:${minutes}`
  }

  const yesterday = new Date(now - 86400000)
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return `昨天 ${hours}:${minutes}`
  }

  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${minutes}`
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${hours}:${minutes}`
}

// 打卡时间：yyyy-m-d hh:mm
export function formatDateTime(timestamp) {
  const ts = getTimestamp(timestamp)
  if (!ts) return ''
  const date = new Date(ts)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}
