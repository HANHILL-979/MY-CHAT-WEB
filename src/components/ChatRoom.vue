<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { showToast } from 'vant'
import { supabase } from '../supabase'
import { identity, identityProfiles, identityNames } from '../identity'

const messages = ref([])
const input = ref('')
const sending = ref(false)
const listRef = ref(null)
let channel = null

// 消息归属判断：与当前身份一致则为"自己"的气泡
function isSelf(msg) {
  return msg.sender === identity.value
}

function avatarOf(sender) {
  return identityProfiles[sender]?.avatar || '🙂'
}

// 对方身份展示名（身份已锁定，用于空状态提示）
const otherName = computed(
  () => (identity.value === 'user_a' ? identityNames.user_b : identityNames.user_a)
)
const otherAvatar = computed(
  () => (identity.value === 'user_a' ? identityProfiles.user_b.avatar : identityProfiles.user_a.avatar)
)

// timestamptz → 本地时区 yyyy-mm-dd
function dateKeyOf(ts) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 日期分隔线文案：今天 / 昨天 / N月N日
function dateLabel(ts) {
  const now = new Date()
  if (dateKeyOf(ts) === dateKeyOf(now)) return '今天'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (dateKeyOf(ts) === dateKeyOf(yesterday)) return '昨天'
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// 与上一条消息不在同一天时显示日期分隔线
function showDivider(msg, idx) {
  if (idx === 0) return true
  return dateKeyOf(msg.created_at) !== dateKeyOf(messages.value[idx - 1].created_at)
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

// iOS 键盘弹起时视口高度变化，自动触底
function onViewportResize() {
  scrollToBottom()
}

// 读取历史消息（最多 200 条，按时间正序）
async function loadHistory() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    showToast('读取历史消息失败')
    return
  }
  messages.value = data || []
  scrollToBottom()
}

// 实时收到新消息：按 id 去重（本地乐观插入过的跳过）
function handleInsert(payload) {
  const msg = payload.new
  if (messages.value.some((m) => m.id === msg.id)) return
  messages.value.push(msg)
  scrollToBottom()
}

// 发送失败时暂存内容，供一键重试
const failedContent = ref('')
let lastSentAt = 0

async function doSend(content) {
  sending.value = true
  const { data, error } = await supabase
    .from('messages')
    .insert([{ sender: identity.value, content }])
    .select()
  if (error) {
    failedContent.value = content
    showToast('发送失败，请重试')
  } else {
    failedContent.value = ''
    // 乐观插入，实时事件回来时按 id 去重
    if (data && data[0]) {
      messages.value.push(data[0])
      scrollToBottom()
    }
    input.value = ''
  }
  sending.value = false
}

async function send() {
  const content = input.value.trim()
  if (!content || sending.value) return
  // 防抖：500ms 内的重复触发（连点/回车）只发送一次
  const now = Date.now()
  if (now - lastSentAt < 500) return
  lastSentAt = now
  await doSend(content)
}

function retry() {
  if (!failedContent.value || sending.value) return
  lastSentAt = Date.now()
  doSend(failedContent.value)
}

onMounted(() => {
  loadHistory()
  // iOS 键盘弹起/收起时视口高度变化，同步滚动到底部
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportResize)
  }
  // 订阅 messages 表 INSERT 事件，毫秒级同步双人消息
  channel = supabase
    .channel('messages_realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      handleInsert
    )
    .subscribe()
})

onUnmounted(() => {
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', onViewportResize)
  }
  if (channel) supabase.removeChannel(channel)
})
</script>

<template>
  <div class="chat-room">
    <div ref="listRef" class="messages-list">
      <div v-if="messages.length === 0" class="empty-tip">
        <div class="empty-emoji">{{ otherAvatar }}</div>
        <p>还没有消息</p>
        <p class="empty-sub">和 {{ otherName }} 说点什么吧～</p>
      </div>

      <template v-for="(msg, idx) in messages" :key="msg.id">
        <!-- 日期分隔线 -->
        <div v-if="showDivider(msg, idx)" class="date-divider">
          <span>{{ dateLabel(msg.created_at) }}</span>
        </div>

        <div class="msg-row" :class="{ 'msg-row-self': isSelf(msg) }">
          <div class="msg-avatar" :class="{ 'msg-avatar-self': isSelf(msg) }">
            {{ avatarOf(msg.sender) }}
          </div>
          <div class="msg-body">
            <div class="msg-item" :class="isSelf(msg) ? 'msg-self' : 'msg-other'">
              {{ msg.content }}
            </div>
            <div class="msg-time">{{ formatTime(msg.created_at) }}</div>
          </div>
        </div>
      </template>
    </div>

    <!-- 发送失败重试条 -->
    <div v-if="failedContent" class="retry-bar">
      <span class="retry-text">「{{ failedContent }}」发送失败</span>
      <van-button size="small" type="warning" plain round @click="retry">重试</van-button>
    </div>

    <div class="input-bar">
      <van-field
        v-model="input"
        class="input-field"
        placeholder="输入消息..."
        maxlength="500"
        @focus="scrollToBottom"
        @keydown.enter="send"
      />
      <button class="send-btn" :class="{ 'send-btn-active': input.trim() }" :disabled="sending" @click="send">
        <van-icon name="arrow" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-room {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 椰林晨雾渐变背景 + 细微圆点纹理 */
  background:
    radial-gradient(circle at 18% 12%, rgba(134, 239, 172, 0.18), transparent 42%),
    radial-gradient(circle at 85% 88%, rgba(147, 197, 253, 0.22), transparent 45%),
    linear-gradient(180deg, #f0f7ff 0%, #f5f9f2 100%);
}

.messages-list {
  flex: 1;
  padding: 16px 14px 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 空状态 */
.empty-tip {
  margin: auto;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.empty-emoji {
  width: 64px;
  height: 64px;
  border-radius: 24px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  font-size: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.empty-sub {
  font-size: 12px;
  color: #94a3b8;
}

/* 日期分隔线 */
.date-divider {
  align-self: center;
  padding: 3px 12px;
  border-radius: 10px;
  background: rgba(100, 116, 139, 0.12);
  backdrop-filter: blur(4px);
  font-size: 11px;
  color: #64748b;
  margin: 2px 0;
}

/* 消息行 */
.msg-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.msg-row-self {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 36px;
  height: 36px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.msg-avatar-self {
  border-color: #dbeafe;
  background: #eff6ff;
}

.msg-body {
  display: flex;
  flex-direction: column;
  max-width: 72%;
}

.msg-row-self .msg-body {
  align-items: flex-end;
}

/* 气泡 */
.msg-item {
  padding: 10px 14px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.55;
  word-break: break-word;
  letter-spacing: 0.2px;
}

/* 自己：蓝紫渐变 */
.msg-self {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #ffffff;
  border-bottom-right-radius: 6px;
  box-shadow: 0 3px 10px rgba(79, 102, 241, 0.28);
}

/* 对方：白色卡片 */
.msg-other {
  background: #ffffff;
  color: #1f2937;
  border-bottom-left-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.msg-time {
  margin-top: 4px;
  font-size: 10px;
  color: #94a3b8;
  padding: 0 2px;
}

/* 发送失败重试条 */
.retry-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: #fffbeb;
  border-top: 1px solid #fde68a;
  flex-shrink: 0;
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
.input-bar {
  display: flex;
  padding: 10px 12px;
  padding-bottom: calc(10px + constant(safe-area-inset-bottom));
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(226, 232, 240, 0.8);
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
}

.input-field {
  flex: 1;
  padding: 0;
}

.input-field :deep(.van-field__control) {
  padding: 11px 18px;
  border: none;
  border-radius: 24px;
  outline: none;
  font-size: 15px;
  background-color: #f1f5f9;
  transition: background-color 0.2s, box-shadow 0.2s;
}

.input-field :deep(.van-field__control:focus) {
  background-color: #ffffff;
  box-shadow: 0 0 0 2px #bfdbfe;
}

/* 发送按钮：渐变圆钮，有内容时点亮 */
.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: #cbd5e1;
  color: #ffffff;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: background 0.25s, transform 0.15s;
}

.send-btn-active {
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  box-shadow: 0 3px 10px rgba(79, 102, 241, 0.35);
}

.send-btn:active {
  transform: scale(0.9);
}
</style>
