<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { showToast } from 'vant'
import { supabase } from '../supabase'
import { identity } from '../identity'

// 可选心情 Emoji
const MOODS = ['😊', '🥰', '😭', '😴', '🎉', '😡', '🤔', '🥲']

const diaries = ref([])
const selectedMood = ref(MOODS[0])
const content = ref('')
const submitting = ref(false)
let channel = null

// ===== 日历视图状态 =====
const showCalendar = ref(false)
// 当前筛选的日期（yyyy-mm-dd），null 表示查看全部
const filterDate = ref('')

// Date/timestamptz → 本地时区 yyyy-mm-dd
function dateKey(input) {
  const d = input instanceof Date ? input : new Date(input)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 日期 → 当天最新一条日记的心情 Emoji（列表已按时间倒序，首次命中即最新）
const moodByDate = computed(() => {
  const map = new Map()
  for (const d of diaries.value) {
    if (!d.created_at) continue
    const key = dateKey(d.created_at)
    if (!map.has(key)) map.set(key, d.mood || '🙂')
  }
  return map
})

// 日历范围：最早日记与一年前取更早者，至今天
const minDate = computed(() => {
  const times = diaries.value.map((d) => new Date(d.created_at).getTime()).filter(Boolean)
  const earliest = times.length ? Math.min(...times) : Infinity
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000
  return new Date(Math.min(earliest, yearAgo))
})

const maxDate = new Date()

// 有日记的日期高亮 + 底部展示当天心情
function dayFormatter(day) {
  const mood = moodByDate.value.get(dateKey(day.date))
  if (mood) {
    day.bottomInfo = mood
    day.className = 'day-has-diary'
  }
  return day
}

function onConfirmCalendar(date) {
  filterDate.value = dateKey(date)
  showCalendar.value = false
}

function clearFilter() {
  filterDate.value = ''
}

// 筛选后的列表：无筛选时为全部日记，有筛选时仅当天
const visibleDiaries = computed(() => {
  if (!filterDate.value) return diaries.value
  return diaries.value.filter((d) => d.created_at && dateKey(d.created_at) === filterDate.value)
})

const filterLabel = computed(() => {
  if (!filterDate.value) return ''
  const [y, m, day] = filterDate.value.split('-')
  return `${y}年${Number(m)}月${Number(day)}日`
})

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

// 读取历史日记（最新在前）
async function loadHistory() {
  const { data, error } = await supabase
    .from('diaries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    showToast('读取日记失败')
    return
  }
  diaries.value = data || []
}

// 实时收到新日记：按 id 去重后插到最前
function handleInsert(payload) {
  const diary = payload.new
  if (diaries.value.some((d) => d.id === diary.id)) return
  diaries.value.unshift(diary)
}

async function submit() {
  const text = content.value.trim()
  if (!text) {
    showToast('写点什么再记录吧')
    return
  }
  if (submitting.value) return
  submitting.value = true
  const { data, error } = await supabase
    .from('diaries')
    .insert([{ author: identity.value, mood: selectedMood.value, content: text }])
    .select()
  if (error) {
    showToast('记录失败: ' + error.message)
  } else {
    if (data && data[0] && !diaries.value.some((d) => d.id === data[0].id)) {
      diaries.value.unshift(data[0])
    }
    content.value = ''
    showToast('已记录今天的心情 ✍️')
  }
  submitting.value = false
}

onMounted(() => {
  loadHistory()
  // 订阅 diaries 表 INSERT 事件，双端同步
  channel = supabase
    .channel('diaries_realtime')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'diaries' },
      handleInsert
    )
    .subscribe()
})

onUnmounted(() => {
  if (channel) supabase.removeChannel(channel)
})
</script>

<template>
  <div class="mood-diary">
    <!-- 记录面板 -->
    <div class="diary-panel">
      <div class="panel-header">
        <span class="panel-title">记录此刻心情</span>
        <van-icon name="calendar-o" class="calendar-btn" @click="showCalendar = true" />
      </div>
      <div class="mood-picker">
        <button
          v-for="mood in MOODS"
          :key="mood"
          class="mood-item"
          :class="{ 'mood-active': mood === selectedMood }"
          type="button"
          @click="selectedMood = mood"
        >
          {{ mood }}
        </button>
      </div>
      <van-field
        v-model="content"
        type="textarea"
        rows="3"
        autosize
        maxlength="500"
        show-word-limit
        placeholder="今天心情怎么样？写下来吧..."
        class="diary-field"
      />
      <div class="diary-actions">
        <van-button type="primary" round size="small" :loading="submitting" @click="submit">
          记录心情
        </van-button>
      </div>
    </div>

    <!-- 日期反查筛选条 -->
    <div v-if="filterDate" class="filter-chip">
      <span>{{ filterLabel }} 的日记（{{ visibleDiaries.length }} 条）</span>
      <van-icon name="cross" class="filter-close" @click="clearFilter" />
    </div>

    <!-- 历史日记瀑布流 -->
    <div ref="listRef" class="diary-list">
      <div v-if="visibleDiaries.length === 0" class="empty-tip">
        {{ filterDate ? '这一天还没有日记' : '还没有日记，记录第一条心情吧 🌱' }}
      </div>
      <div v-for="diary in visibleDiaries" :key="diary.id" class="diary-card" :class="`diary-${diary.author}`">
        <div class="diary-head">
          <span class="diary-mood">{{ diary.mood || '🙂' }}</span>
          <span class="diary-author">{{ diary.author === 'user_a' ? 'A' : 'B' }}</span>
          <span class="diary-date">{{ formatDate(diary.created_at) }}</span>
        </div>
        <div class="diary-content">{{ diary.content }}</div>
      </div>
    </div>

    <!-- 心情打卡日历：有日记的日期高亮，点击日期反查 -->
    <van-calendar
      v-model:show="showCalendar"
      title="心情打卡日历"
      :show-confirm="false"
      :min-date="minDate"
      :max-date="maxDate"
      :formatter="dayFormatter"
      @confirm="onConfirmCalendar"
    />
  </div>
</template>

<style scoped>
.mood-diary {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f8fafc;
}

.diary-panel {
  margin: 12px;
  padding: 14px;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.calendar-btn {
  font-size: 20px;
  color: #3b82f6;
  padding: 4px;
  cursor: pointer;
}

/* 日期反查筛选条 */
.filter-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 12px 10px;
  padding: 6px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  font-size: 12px;
  color: #1d4ed8;
  flex-shrink: 0;
}

.filter-close {
  cursor: pointer;
  padding: 2px;
}

/* 日历中有日记的日期：高亮 + 底部心情角标 */
:deep(.van-calendar__day.day-has-diary) {
  color: #2563eb;
  font-weight: 600;
  background: #eff6ff;
  border-radius: 8px;
}

:deep(.van-calendar__bottom-info) {
  font-size: 12px;
  line-height: 1.2;
}

.mood-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.mood-item {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid transparent;
  background: #f1f5f9;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mood-item:active {
  transform: scale(0.92);
}

.mood-active {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.diary-field :deep(.van-field__control) {
  font-size: 14px;
  line-height: 1.6;
}

.diary-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.diary-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 16px;
  /* 双列瀑布流 */
  column-count: 2;
  column-gap: 10px;
}

.empty-tip {
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
  column-span: all;
}

.diary-card {
  break-inside: avoid;
  margin-bottom: 10px;
  padding: 12px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  /* 限制卡片高度上限，保证瀑布流滚动流畅 */
  max-height: 320px;
  overflow: hidden;
}

/* 不同作者的日记用不同的顶部色带区分 */
.diary-user_a {
  border-top: 3px solid #60a5fa;
}

.diary-user_b {
  border-top: 3px solid #34d399;
}

.diary-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.diary-mood {
  font-size: 20px;
  /* 修复 Emoji 与文字混排时基线错位 */
  line-height: 1;
}

.diary-author {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.diary-date {
  margin-left: auto;
  font-size: 11px;
  color: #94a3b8;
}

.diary-content {
  font-size: 13px;
  line-height: 1.7;
  color: #334155;
  word-break: break-word;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  /* 长文本最多展示 6 行，超出截断，防止单张卡片撑爆瀑布流 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
  overflow: hidden;
}
</style>
