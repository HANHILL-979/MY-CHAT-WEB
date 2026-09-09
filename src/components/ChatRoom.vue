<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { showToast, showDialog, showImagePreview } from 'vant'
import { supabase } from '../supabase'
import { identity, identityProfiles, nameOf } from '../identity'
import { theme } from '../theme'
import { formatTime, getTimestamp } from '../utils/time'
import { pickImages, compressImage, isImageContent, vibrate } from '../utils/image'

const props = defineProps({
  active: { type: Boolean, default: true },
})
const emit = defineEmits(['switch-role', 'chat-read'])

const messages = ref([])
const input = ref('')
const sending = ref(false)
const listRef = ref(null)
const chatBg = ref('')
const isLoadingHistory = ref(false)
const isHistoryOver = ref(false)
const failedContent = ref('')
let channel = null
let longPressTimer = null
let deletingMsgId = null
let pollTimer = null
let lastActionTime = 0
let lastSentAt = 0
let saveTimer = null

const themeClass = computed(() => (theme.value === 'male' ? 'theme-male' : 'theme-female'))

// 壁纸背景（男性主题无壁纸时透明，透出全局日落实景）
const backgroundStyle = computed(() => {
  const fallback =
    theme.value === 'male'
      ? 'none'
      : 'linear-gradient(160deg, #fffdf5 0%, #ffe7ef 50%, #fff3d9 100%)'
  return { backgroundImage: chatBg.value ? `url(${chatBg.value})` : fallback }
})

function isSelf(msg) {
  return msg.sender === identity.value
}

// 消息归一化：统一 create_time 毫秒 + HH:MM 显示时间
// 注意：解析失败时不再用 Date.now() 伪造时间（那会导致去重 key 错乱 + 时间显示错误）
function normalizeMessage(item = {}) {
  const ts = getTimestamp(item.created_at || item.create_time)
  return { ...item, create_time: ts, time: ts ? formatTime(ts) : '' }
}

function scrollToBottom() {
  nextTick(() => {
    setTimeout(() => {
      if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
    }, 60)
  })
}

// iOS 键盘弹起时视口高度变化，自动触底
function onViewportResize() {
  scrollToBottom()
}

function activeTouch() {
  lastActionTime = Date.now()
}

// ---- 本地缓存（防白屏；图片 dataURL 过大不入缓存，避免 JSON 解析卡顿与 localStorage 爆仓） ----
function saveToLocal() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const slim = messages.value
        .slice(-50)
        .map((m) => (typeof m.content === 'string' && m.content.length > 30000 ? { ...m, content: '[图片]' } : m))
      localStorage.setItem('chat_history_cache', JSON.stringify(slim))
    } catch (e) {
      console.warn('缓存聊天记录失败', e)
    }
  }, 300)
}

function loadFromLocal() {
  try {
    const local = JSON.parse(localStorage.getItem('chat_history_cache') || '[]')
    if (Array.isArray(local) && local.length > 0) {
      // 按 id 去重（历史 bug 可能写入过重复消息），并重新归一化修复时间
      const seen = new Set()
      messages.value = local
        .filter((m) => {
          const key = m.id != null ? m.id : `${m.create_time}_${m.sender}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .map(normalizeMessage)
        .filter((m) => m.create_time > 0)
        .sort((a, b) => a.create_time - b.create_time)
      scrollToBottom()
    }
  } catch (e) {
    /* 忽略损坏缓存 */
  }
}

// ---- 拉取新消息（容错：-60 秒重叠窗口 + 双重去重） ----
async function fetchNewMessages() {
  try {
    let query
    if (messages.value.length > 0) {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg.create_time) {
        const safeTime = lastMsg.create_time - 60000
        query = supabase
          .from('messages')
          .select('*')
          .gt('created_at', new Date(safeTime).toISOString())
          .order('created_at', { ascending: true })
          .limit(100)
      }
    }
    if (!query) {
      query = supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(50)
    }
    const { data, error } = await query
    if (error) throw error
    let newData = (data || []).map(normalizeMessage)
    if (messages.value.length === 0 && newData.length > 0 && newData[0].create_time > newData[newData.length - 1].create_time) {
      newData = newData.reverse()
    }
    if (newData.length > 0) {
      const existIds = new Set(messages.value.filter((m) => m.id != null).map((m) => m.id))
      const existKeys = new Set(messages.value.map((m) => `${m.create_time}_${m.sender}`))
      const realNewMsgs = newData.filter((m) => {
        if (m.id != null) return !existIds.has(m.id)
        return !existKeys.has(`${m.create_time}_${m.sender}`)
      })
      // 用服务端数据回填缓存中的 [图片] 占位（图片 dataURL 未入本地缓存）
      newData.forEach((m) => {
        if (m.id != null && typeof m.content === 'string' && m.content.startsWith('data:image')) {
          const idx = messages.value.findIndex((x) => x.id === m.id && x.content === '[图片]')
          if (idx > -1) messages.value.splice(idx, 1, normalizeMessage(m))
        }
      })
      if (realNewMsgs.length > 0) {
        messages.value = [...messages.value, ...realNewMsgs].sort((a, b) => a.create_time - b.create_time)
        saveToLocal()
        scrollToBottom()
        activeTouch()
      }
    }
  } catch (err) {
    console.error('拉取消息失败:', err)
  }
}

// ---- 上滑加载历史（每页 20 条） ----
async function getMoreHistory() {
  if (isLoadingHistory.value || isHistoryOver.value || messages.value.length === 0) return
  const el = listRef.value
  if (!el || el.scrollTop > 40) return
  isLoadingHistory.value = true
  try {
    const oldestTime = messages.value[0].create_time
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .lt('created_at', new Date(oldestTime).toISOString())
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    const oldData = (data || []).map(normalizeMessage).reverse()
    if (oldData.length > 0) {
      const prevHeight = el.scrollHeight
      messages.value = [...oldData, ...messages.value].sort((a, b) => a.create_time - b.create_time)
      saveToLocal()
      // 保持视口停留在原位置
      nextTick(() => {
        el.scrollTop = el.scrollHeight - prevHeight
      })
    } else {
      isHistoryOver.value = true
    }
  } catch (err) {
    console.error('加载历史失败:', err)
  } finally {
    isLoadingHistory.value = false
  }
}

// ---- 实时订阅：毫秒级同步双人消息 ----
function handleInsert(payload) {
  const msg = normalizeMessage(payload.new)
  if (messages.value.some((m) => m.id === msg.id)) return
  if (msg.sender === identity.value) return // 自己的乐观插入已在本地
  messages.value.push(msg)
  saveToLocal()
  scrollToBottom()
  activeTouch()
}

// ---- 自适应轮询（活跃 3s / 静默 15s，兜底实时断线） ----
function startPolling() {
  stopPolling()
  const delay = Date.now() - lastActionTime < 60000 ? 3000 : 15000
  pollTimer = setTimeout(() => {
    if (props.active) fetchNewMessages()
    startPolling()
  }, delay)
}
function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

// 发送/拉取回调统一入口：按 id 查重后再入列（防止轮询/realtime 已先插入同一案消息）
function appendMessage(raw) {
  const msg = normalizeMessage(raw)
  if (msg.id != null) {
    const idx = messages.value.findIndex((m) => m.id === msg.id)
    if (idx > -1) {
      messages.value.splice(idx, 1, msg) // 已存在则用服务端权威数据覆盖
      return
    }
  } else if (messages.value.some((m) => m.create_time === msg.create_time && m.sender === msg.sender)) {
    return
  }
  messages.value.push(msg)
  saveToLocal()
  scrollToBottom()
}

// ---- 发送文本 ----
async function doSend(content) {
  sending.value = true
  const { data, error } = await supabase.from('messages').insert([{ sender: identity.value, content }]).select()
  if (error) {
    failedContent.value = content
    showToast('发送失败，请重试')
  } else {
    failedContent.value = ''
    if (data && data[0]) appendMessage(data[0])
    input.value = ''
  }
  sending.value = false
}

async function send() {
  const content = input.value.trim()
  if (!content || sending.value) return
  const now = Date.now()
  if (now - lastSentAt < 500) return
  lastSentAt = now
  activeTouch()
  await doSend(content)
}

function retry() {
  if (!failedContent.value || sending.value) return
  lastSentAt = Date.now()
  doSend(failedContent.value)
}

// ---- 发送图片（压缩后以 dataURL 存入 content） ----
async function chooseImage() {
  if (sending.value) return
  activeTouch()
  const files = await pickImages(1)
  if (!files.length) return
  sending.value = true
  showToast({ message: '发送中...', duration: 0, forbidClick: true })
  try {
    const dataUrl = await compressImage(files[0], 1080, 0.75)
    const { data, error } = await supabase
      .from('messages')
      .insert([{ sender: identity.value, content: dataUrl }])
      .select()
    if (error) throw error
    if (data && data[0]) appendMessage(data[0])
  } catch (e) {
    console.error('图片发送失败', e)
    showToast('上传失败，请重试')
  } finally {
    sending.value = false
    showToast.clear && showToast.clear()
  }
}

// ---- 更换聊天壁纸 ----
async function changeWallpaper() {
  const files = await pickImages(1)
  if (!files.length) return
  try {
    const dataUrl = await compressImage(files[0], 1280, 0.8)
    chatBg.value = dataUrl
    localStorage.setItem('custom_chat_bg', dataUrl)
    showToast('聊天背景已更新')
  } catch (e) {
    showToast('背景设置失败')
  }
}

// ---- 长按删除消息 ----
function handleTouchStart(msg) {
  longPressTimer = setTimeout(() => {
    vibrate(15)
    deletingMsgId = msg.id
    const preview = isImageContent(msg.content) ? '[图片]' : msg.content
    showDialog({
      title: '提示',
      message: `确定删除这条回忆吗？\n\n「${preview}」`,
      showCancelButton: true,
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
      .then(async () => {
        const { error } = await supabase.from('messages').delete().eq('id', deletingMsgId)
        if (error) {
          showToast('删除失败：' + error.message)
        } else {
          messages.value = messages.value.filter((m) => m.id !== deletingMsgId)
          saveToLocal()
          showToast('已删除')
        }
      })
      .catch(() => {})
  }, 500)
}

function handleTouchEnd() {
  clearTimeout(longPressTimer)
}

// ---- 长按顶栏：清空本地缓存（复刻 Linda1 调试入口） ----
function handleTopBarLongPress() {
  longPressTimer = setTimeout(() => {
    showDialog({
      title: '调试',
      message: '清空本地聊天缓存(也会清空壁纸)',
      showCancelButton: true,
    })
      .then(() => {
        localStorage.removeItem('chat_history_cache')
        localStorage.removeItem('custom_chat_bg')
        chatBg.value = ''
        messages.value = []
        isHistoryOver.value = false
        fetchNewMessages()
        showToast('已清空')
      })
      .catch(() => {})
  }, 600)
}

function previewImg(url) {
  if (url) showImagePreview([url])
}

// 活跃状态下消息变化即视为已读（供全局红点使用）
watch(
  () => messages.value.length,
  () => {
    if (props.active) emit('chat-read')
  }
)

watch(
  () => props.active,
  (v) => {
    if (v) {
      activeTouch()
      fetchNewMessages()
      scrollToBottom()
    }
  }
)

onMounted(() => {
  const savedBg = localStorage.getItem('custom_chat_bg')
  if (savedBg) chatBg.value = savedBg
  loadFromLocal()
  activeTouch()
  fetchNewMessages()
  startPolling()
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportResize)
  }
  channel = supabase
    .channel('messages_realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, handleInsert)
    .subscribe()
})

onUnmounted(() => {
  stopPolling()
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', onViewportResize)
  }
  if (channel) supabase.removeChannel(channel)
})
</script>

<template>
  <div class="chat-room" :class="themeClass" :style="backgroundStyle" @click="activeTouch">
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>

    <!-- 顶栏（双主题） -->
    <div class="top-bar" @touchstart="handleTopBarLongPress" @touchend="handleTouchEnd" @contextmenu.prevent>
      <template v-if="theme !== 'male'">
        <div>
          <span class="top-eyebrow">Private Channel</span>
          <span class="top-title">秘密基地</span>
          <span class="top-subtitle">只属于你我的小宇宙</span>
        </div>
        <!-- 点击右上角胶囊切换身份 -->
        <div class="top-chip" @click.stop="emit('switch-role')">{{ messages.length }} 条心跳</div>
      </template>
      <template v-else>
        <div>
          <span class="top-eyebrow">私密频道</span>
          <span class="top-title">秘密基地</span>
          <span class="top-subtitle">共 {{ messages.length }} 条消息</span>
        </div>
        <div class="top-chip" @click.stop="emit('switch-role')">在线</div>
      </template>
    </div>

    <!-- 消息列表 -->
    <div ref="listRef" class="chat-list" @scroll="getMoreHistory">
      <div v-if="isLoadingHistory" class="loading-tip">
        <span class="glass-tag">正在寻找回忆...</span>
      </div>

      <div
        v-for="item in messages"
        :key="item.id || item.create_time"
        class="message-row"
        :class="{ self: isSelf(item) }"
        @touchstart="handleTouchStart(item)"
        @touchend="handleTouchEnd"
        @touchcancel="handleTouchEnd"
        @contextmenu.prevent
      >
        <img v-if="!isSelf(item)" class="avatar left-avatar" :src="identityProfiles[item.sender]?.img" alt="" />

        <div class="content-box">
          <span v-if="!isSelf(item)" class="nickname">{{ nameOf(item.sender) }}</span>

          <img
            v-if="isImageContent(item.content)"
            class="img-bubble"
            :src="item.content"
            alt=""
            @click.stop="previewImg(item.content)"
          />
          <div v-else class="bubble text-bubble" :class="isSelf(item) ? 'right-bubble' : 'left-bubble'">
            <span class="bubble-text">{{ item.content }}</span>
            <span class="bubble-time">{{ item.time }}</span>
          </div>
        </div>

        <img v-if="isSelf(item)" class="avatar right-avatar" :src="identityProfiles[item.sender]?.img" alt="" />
      </div>

      <div class="bottom-spacer"></div>
    </div>

    <!-- 发送失败重试条 -->
    <div v-if="failedContent" class="retry-bar">
      <span class="retry-text">「{{ failedContent }}」发送失败</span>
      <van-button size="small" type="warning" plain round @click="retry">重试</van-button>
    </div>

    <!-- 底部输入栏 -->
    <div class="footer glass-footer">
      <div class="icon-btn" @click="changeWallpaper">🌌</div>
      <div class="icon-btn" @click="chooseImage">🖼️</div>

      <input
        v-model="input"
        class="input-box"
        placeholder="偷偷说句情话..."
        maxlength="500"
        @keyup.enter="send"
        @focus="activeTouch"
      />

      <div
        class="send-btn"
        :class="{ 'btn-active': input.length > 0 && !sending }"
        :style="{ opacity: sending ? 0.6 : 1 }"
        @click="send"
      >
        {{ sending ? '发送中...' : '发送' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-room {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  background-size: cover;
  background-position: center;
  overflow: hidden;
}
.chat-room.theme-female {
  font-family: "ZCOOL XiaoWei", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  color: #4b3046;
}
.chat-room.theme-male {
  font-family: inherit; /* 跟随全局 iOS 系统字体 */
  color: var(--ios-text);
}
.chat-room.theme-male::before {
  content: none; /* iOS 风格：无网格装饰线 */
}
.chat-room.theme-male::after {
  content: none; /* iOS 风格：无扫描线动画 */
}

.ambient {
  position: absolute;
  border-radius: 50%;
  filter: blur(36px);
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
}
.theme-female .ambient-one { width: 240px; height: 240px; right: -70px; top: 40px; background: rgba(255, 183, 197, 0.32); }
.theme-female .ambient-two { width: 260px; height: 260px; left: -90px; bottom: 140px; background: rgba(255, 217, 61, 0.22); }
.theme-male .ambient-one { width: 260px; height: 260px; right: -80px; top: 30px; background: rgba(10, 132, 255, 0.1); }
.theme-male .ambient-two { width: 240px; height: 240px; left: -70px; bottom: 120px; background: rgba(120, 120, 128, 0.1); }

/* 顶栏 */
.top-bar {
  position: relative;
  z-index: 2;
  padding: 14px 16px 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-shrink: 0;
  user-select: none;
}
.top-eyebrow { display: block; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; opacity: 0.7; margin-bottom: 6px; }
.top-title { display: block; font-size: 22px; font-weight: 800; }
.top-subtitle { display: block; font-size: 12px; opacity: 0.75; margin-top: 6px; }
.top-chip {
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  backdrop-filter: blur(14px);
  cursor: pointer;
}
.theme-female .top-chip { background: rgba(255, 255, 255, 0.7); border: 1px solid rgba(255, 183, 197, 0.28); color: #7a5564; }
.theme-male .top-chip { background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.85); border-radius: 999px; }

/* 消息列表 */
.chat-list {
  flex: 1;
  padding: 8px 14px 16px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  width: 100%;
  position: relative;
  z-index: 1;
}
.loading-tip { text-align: center; margin-bottom: 15px; }
.glass-tag {
  font-size: 12px;
  background: rgba(255, 255, 255, 0.12);
  color: #f0ebff;
  padding: 6px 16px;
  border-radius: 999px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.message-row { display: flex; margin-bottom: 18px; width: 100%; align-items: flex-end; }
.self { justify-content: flex-end; }
.avatar {
  width: 44px;
  height: 44px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 18px rgba(8, 5, 19, 0.2);
  flex-shrink: 0;
  object-fit: cover;
  background: #fff;
}
.theme-male .avatar { border-radius: 50%; border: none; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3); }
.left-avatar { margin-right: 12px; }
.right-avatar { margin-left: 12px; }

.content-box { max-width: 72%; display: flex; flex-direction: column; user-select: none; -webkit-user-select: none; }
.self .content-box { align-items: flex-end; }
.nickname { font-size: 11px; margin-bottom: 6px; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.18); margin-left: 4px; margin-right: 4px; }
.theme-female .nickname { color: rgba(108, 82, 96, 0.8); }
.theme-male .nickname { color: var(--ios-text-2); text-shadow: none; }

.bubble {
  padding: 12px 15px;
  font-size: 15px;
  word-break: break-all;
  line-height: 1.7;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  position: relative;
}
.bubble-text { display: block; white-space: pre-wrap; }
.bubble-time { display: block; margin-top: 8px; font-size: 10px; opacity: 0.7; text-align: right; }
.theme-female .left-bubble { background: rgba(255, 255, 255, 0.9); color: #3a2c3f; border-radius: 20px 20px 20px 8px; }
.theme-female .right-bubble {
  background: linear-gradient(135deg, rgba(255, 183, 197, 0.95) 0%, rgba(255, 217, 61, 0.95) 100%);
  color: #5a3947;
  border-radius: 20px 20px 8px 20px;
}
.theme-male .left-bubble { background: rgba(255, 255, 255, 0.16); color: #ffffff; border-radius: 20px 20px 20px 6px; border: none; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
.theme-male .right-bubble {
  background: var(--ios-accent);
  color: #ffffff;
  border-radius: 20px 20px 6px 20px;
  border: none;
  box-shadow: 0 4px 14px rgba(10, 132, 255, 0.35);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.img-bubble {
  max-width: 176px;
  display: block;
  border-radius: 18px;
  border: 2px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
  cursor: pointer;
}
.theme-male .img-bubble { border-radius: 16px; border: none; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3); }

.bottom-spacer { height: 20px; }

/* 重试条 */
.retry-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: #fffbeb;
  border-top: 1px solid #fde68a;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
.retry-text {
  flex: 1;
  font-size: 12px;
  color: #b45309;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 底部输入栏 */
.footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom));
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}
.glass-footer {
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  box-shadow: 0 -10px 24px rgba(0, 0, 0, 0.16);
}
.theme-female .glass-footer { background: rgba(255, 255, 255, 0.7); border-top: 1px solid rgba(255, 183, 197, 0.25); }
.theme-male .glass-footer { background: rgba(255, 255, 255, 0.12); border-top: 0.5px solid rgba(255, 255, 255, 0.2); box-shadow: none; }

.icon-btn { font-size: 22px; transition: transform 0.1s; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15)); flex-shrink: 0; cursor: pointer; }
.theme-female .icon-btn { color: #b86a7f; }
.theme-male .icon-btn { color: var(--ios-text-2); filter: none; }
.icon-btn:active { transform: scale(0.85); }

.input-box {
  flex: 1;
  height: 42px;
  padding: 0 16px;
  font-size: 15px;
  border: 1px solid transparent;
  outline: none;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.08);
  min-width: 0;
}
.theme-female .input-box { background: rgba(255, 255, 255, 0.85); border-radius: 22px; color: #4b3046; border-color: rgba(255, 183, 197, 0.35); }
.theme-male .input-box { background: var(--ios-fill); border-radius: 999px; color: var(--ios-text); border-color: transparent; box-shadow: none; }

.send-btn {
  padding: 0 16px;
  height: 42px;
  line-height: 42px;
  font-size: 14px;
  font-weight: 700;
  transition: background-color 0.2s ease-out, color 0.2s ease-out;
  flex-shrink: 0;
  cursor: pointer;
}
.theme-female .send-btn { background: rgba(255, 183, 197, 0.2); color: #8c5567; border-radius: 22px; }
.theme-male .send-btn { background: transparent; color: var(--ios-accent); border-radius: 999px; border: none; font-weight: 600; }
.theme-female .send-btn.btn-active {
  background: linear-gradient(135deg, #ffb7c5 0%, #ffd93d 100%);
  color: #5a3947;
  box-shadow: 0 10px 20px rgba(255, 183, 197, 0.28);
}
.theme-male .send-btn.btn-active {
  background: var(--ios-accent);
  color: #ffffff;
  box-shadow: none;
}
</style>
