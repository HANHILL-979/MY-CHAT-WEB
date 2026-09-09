<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { showToast } from 'vant'
import { supabase } from '../supabase'
import { identity, identityNames } from '../identity'

const messages = ref([])
const input = ref('')
const sending = ref(false)
const listRef = ref(null)
let channel = null

// 消息归属判断：与当前身份一致则为"自己"的气泡
function isSelf(msg) {
  return msg.sender === identity.value
}

// 对方身份展示名（身份已锁定，用于空状态提示）
const otherName = computed(
  () => (identity.value === 'user_a' ? identityNames.user_b : identityNames.user_a)
)

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
        还没有消息，和 {{ otherName }} 说点什么吧～
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="msg-row"
        :class="{ 'msg-row-self': isSelf(msg) }"
      >
        <div class="msg-avatar">{{ isSelf(msg) ? 'A' : 'B' }}</div>
        <div class="msg-body">
          <div
            class="msg-item"
            :class="isSelf(msg) ? 'msg-self' : 'msg-other'"
          >{{ msg.content }}</div>
          <div class="msg-time">{{ formatTime(msg.created_at) }}</div>
        </div>
      </div>
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
      <van-button type="primary" round class="send-btn" :loading="sending" @click="send">
        发送
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.chat-room {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f8fafc;
}

.messages-list {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-tip {
  margin: auto;
  color: #94a3b8;
  font-size: 13px;
}

.msg-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.msg-row-self {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #93c5fd, #60a5fa);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.msg-row-self .msg-avatar {
  background: linear-gradient(135deg, #6ee7b7, #34d399);
}

.msg-body {
  display: flex;
  flex-direction: column;
  max-width: 75%;
}

.msg-row-self .msg-body {
  align-items: flex-end;
}

.msg-item {
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.msg-self {
  background-color: #3b82f6;
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.msg-other {
  background-color: #ffffff;
  color: #1f2937;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 4px;
}

.msg-time {
  margin-top: 4px;
  font-size: 11px;
  color: #94a3b8;
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

.input-bar {
  display: flex;
  padding: 10px 12px;
  padding-bottom: calc(10px + constant(safe-area-inset-bottom));
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background-color: #ffffff;
  border-top: 1px solid #e2e8f0;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
}

.input-field {
  flex: 1;
  padding: 0;
}

.input-field :deep(.van-field__control) {
  padding: 10px 16px;
  border: 1px solid #cbd5e1;
  border-radius: 24px;
  outline: none;
  font-size: 14px;
  background-color: #f8fafc;
  transition: border-color 0.2s;
}

.input-field :deep(.van-field__control:focus) {
  border-color: #3b82f6;
  background-color: #ffffff;
}

.send-btn {
  padding: 0 18px;
  height: 38px;
  font-weight: 600;
}
</style>
