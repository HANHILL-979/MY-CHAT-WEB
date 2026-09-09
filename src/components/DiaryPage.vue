<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast, showImagePreview } from 'vant'
import { supabase } from '../supabase'
import { identity } from '../identity'
import { theme } from '../theme'
import { getTimestamp } from '../utils/time'
import { pickAndCompress } from '../utils/image'

const emit = defineEmits(['close'])

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)
const diaryMap = ref({})

const showModal = ref(false)
const mode = ref('view') // 'view' | 'write'

const isEditing = ref(false)
const targetDateStr = ref('')
const targetId = ref(null)
const newMood = ref('happy')
const newContent = ref('')
const tempImages = ref([])

const currentDetail = ref({})
const selectedDateStr = ref('')
const tableMissing = ref(false)

const themeClass = computed(() => (theme.value === 'male' ? 'theme-male' : 'theme-female'))

// 🌟 24 个超丰富心情（复刻 Linda1 moodList）
const moodList = [
  { key: 'happy', emoji: '😄', name: '开心' },
  { key: 'love', emoji: '🥰', name: '爱你' },
  { key: 'kiss', emoji: '😘', name: '亲亲' },
  { key: 'miss', emoji: '🥺', name: '想你' },
  { key: 'cool', emoji: '😎', name: '耍酷' },
  { key: 'sad', emoji: '😭', name: '难过' },
  { key: 'angry', emoji: '😡', name: '生气' },
  { key: 'tired', emoji: '😴', name: '困困' },
  { key: 'sick', emoji: '😷', name: '生病' },
  { key: 'hungry', emoji: '😋', name: '馋了' },
  { key: 'work', emoji: '💪', name: '奋斗' },
  { key: 'party', emoji: '🎉', name: '庆祝' },
  { key: 'travel', emoji: '✈️', name: '旅行' },
  { key: 'gift', emoji: '🎁', name: '礼物' },
  { key: 'game', emoji: '🎮', name: '游戏' },
  { key: 'movie', emoji: '🎬', name: '电影' },
  { key: 'rain', emoji: '🌧️', name: '下雨' },
  { key: 'sun', emoji: '☀️', name: '天晴' },
  { key: 'cat', emoji: '🐱', name: '撸猫' },
  { key: 'dog', emoji: '🐶', name: '遛狗' },
  { key: 'sleep', emoji: '💤', name: '睡觉' },
  { key: 'fire', emoji: '🔥', name: '燃' },
  { key: 'money', emoji: '💰', name: '暴富' },
  { key: 'poop', emoji: '💩', name: '无语' },
]

const daysInMonth = computed(() => new Date(currentYear.value, currentMonth.value, 0).getDate())
const emptyDays = computed(() => new Date(currentYear.value, currentMonth.value - 1, 1).getDay())
const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})
const monthCount = computed(() => Object.keys(diaryMap.value || {}).length)

// ---- 日历操作 ----
function changeMonth(step) {
  let m = currentMonth.value + step
  let y = currentYear.value
  if (m > 12) {
    m = 1
    y++
  } else if (m < 1) {
    m = 12
    y--
  }
  currentMonth.value = m
  currentYear.value = y
  fetchMonthDiaries()
}

function resetToday() {
  const d = new Date()
  currentYear.value = d.getFullYear()
  currentMonth.value = d.getMonth() + 1
  fetchMonthDiaries()
}

function getDateStr(day) {
  return `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isSameMonth(dateStr) {
  const normalized = String(dateStr).replace(/\//g, '-')
  const parts = normalized.split('-')
  if (parts.length < 2) return false
  return parseInt(parts[0], 10) === currentYear.value && parseInt(parts[1], 10) === currentMonth.value
}

function isToday(day) {
  return getDateStr(day) === todayStr.value
}

// ---- 拉取本月日记（按 date_str 精确匹配 + 全量兜底兼容旧数据） ----
async function fetchMonthDiaries() {
  const mm = String(currentMonth.value).padStart(2, '0')
  const monthPattern = `${currentYear.value}-${mm}-%`
  try {
    const { data, error } = await supabase
      .from('diaries')
      .select('*')
      .like('date_str', monthPattern)
      .limit(200)
    if (error) throw error
    diaryMap.value = {}
    const list = data || []
    list.forEach((item) => {
      const dateStr = item.date_str || item.dateStr
      if (dateStr) diaryMap.value[dateStr] = item
    })

    // 兜底：date_str 查不到时拉全量，客户端按月过滤（兼容旧版时间流数据）
    if (!list.length) {
      const { data: fallbackList, error: fbErr } = await supabase.from('diaries').select('*').limit(500)
      if (fbErr) throw fbErr
      ;(fallbackList || []).forEach((item) => {
        // 旧数据无 date_str：用 created_at 推导日期
        const dateStr = item.date_str || toDateStr(item.created_at)
        if (!dateStr) return
        if (isSameMonth(dateStr)) diaryMap.value[dateStr] = { ...item, date_str: dateStr }
      })
    }
    tableMissing.value = false
  } catch (e) {
    console.error('获取日记失败', e)
    tableMissing.value = true
  }
}

function toDateStr(value) {
  const ts = getTimestamp(value)
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---- 点击格子 ----
function onDayClick(day) {
  const dateStr = getDateStr(day)
  if (diaryMap.value[dateStr]) {
    selectedDateStr.value = dateStr
    currentDetail.value = JSON.parse(JSON.stringify(diaryMap.value[dateStr]))
    mode.value = 'view'
    showModal.value = true
  } else {
    const target = new Date(currentYear.value, currentMonth.value - 1, day)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    if (target > now) {
      showToast('不能预知未来哦~')
    } else {
      startNewDiary(dateStr)
    }
  }
}

// ---- 写日记 ----
function startNewDiary(dateStr) {
  targetDateStr.value = dateStr
  isEditing.value = false
  targetId.value = null
  newMood.value = 'happy'
  newContent.value = ''
  tempImages.value = []
  mode.value = 'write'
  showModal.value = true
}

function switchToEdit() {
  isEditing.value = true
  targetDateStr.value = selectedDateStr.value
  targetId.value = currentDetail.value.id || currentDetail.value._id
  newMood.value = currentDetail.value.mood
  newContent.value = currentDetail.value.content
  tempImages.value = currentDetail.value.images || []
  mode.value = 'write'
}

async function chooseImages() {
  const rest = 9 - tempImages.value.length
  if (rest <= 0) return
  const urls = await pickAndCompress(rest, 960, 0.7)
  tempImages.value = [...tempImages.value, ...urls]
}

function removeImg(idx) {
  tempImages.value.splice(idx, 1)
}

function previewImg(urls, current) {
  showImagePreview({ images: urls, startPosition: current || 0, closeable: true })
}

// ---- 提交保存（新增 / 修改） ----
async function submitDiary() {
  if (!newContent.value.trim() && tempImages.value.length === 0) {
    showToast('写点什么吧~')
    return
  }
  showToast({ message: '保存中...', duration: 0, forbidClick: true })
  const data = {
    date_str: targetDateStr.value,
    mood: newMood.value,
    content: newContent.value || ' ',
    images: tempImages.value,
    writer: identity.value,
    author: identity.value, // 兼容旧版 author 列
  }
  try {
    let error
    if (isEditing.value && targetId.value) {
      ;({ error } = await supabase.from('diaries').update(data).eq('id', targetId.value))
    } else {
      ;({ error } = await supabase.from('diaries').insert([data]))
    }
    if (error) throw error
    showToast.clear && showToast.clear()
    showToast('保存成功 ❤️')
    showModal.value = false
    fetchMonthDiaries()
  } catch (err) {
    showToast.clear && showToast.clear()
    console.error('保存失败:', err)
    showToast('保存失败：请先在 Supabase 执行 supabase-setup.sql 为 diaries 表加列')
  }
}

function closeModal() {
  showModal.value = false
}

function goBack() {
  emit('close')
}

function getMoodForDay(day) {
  return diaryMap.value[getDateStr(day)]?.mood
}
function getMoodEmoji(key) {
  return moodList.find((m) => m.key === key)?.emoji || '📅'
}
function getMoodName(key) {
  return moodList.find((m) => m.key === key)?.name || ''
}

onMounted(() => {
  fetchMonthDiaries()
})
</script>

<template>
  <div class="diary-page scroll-area" :class="themeClass">
    <!-- 顶部导航（双主题） -->
    <template v-if="theme !== 'male'">
      <div class="nav-header">
        <span class="app-name">Mood Diary</span>
        <span class="sub-name">大椰树 & 小椰宝 的小世界 👩‍❤️‍👨</span>
      </div>
    </template>
    <template v-else>
      <div class="console-header">
        <div>
          <span class="console-eyebrow">心情日历</span>
          <span class="console-title">{{ currentYear }} / {{ String(currentMonth).padStart(2, '0') }}</span>
          <span class="console-sub">本月 {{ monthCount }} 篇</span>
        </div>
        <div class="console-actions">
          <div class="console-btn" @click="changeMonth(-1)">上月</div>
          <div class="console-btn primary" @click="resetToday">今天</div>
          <div class="console-btn" @click="changeMonth(1)">下月</div>
        </div>
      </div>
    </template>

    <!-- 返回按钮 -->
    <div class="back-bar">
      <span class="back-btn" @click="goBack">❮ 返回</span>
    </div>

    <!-- 日历卡片 -->
    <div class="calendar-card">
      <template v-if="theme !== 'male'">
        <div class="calendar-top">
          <div class="current-date">
            <span class="year-text">{{ currentYear }}年</span>
            <span class="month-text">{{ currentMonth }}月</span>
          </div>
          <div class="btn-group">
            <div class="arrow-btn" @click="changeMonth(-1)">👈</div>
            <div class="today-btn" @click="resetToday">月</div>
            <div class="arrow-btn" @click="changeMonth(1)">👉</div>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="calendar-top console-top">
          <div class="current-date">
            <span class="year-text">{{ currentYear }}</span>
            <span class="month-text">M{{ String(currentMonth).padStart(2, '0') }}</span>
          </div>
          <div class="btn-group">
            <div class="arrow-btn" @click="changeMonth(-1)">◄</div>
            <div class="today-btn" @click="resetToday">NOW</div>
            <div class="arrow-btn" @click="changeMonth(1)">►</div>
          </div>
        </div>
      </template>

      <div class="week-header">
        <span v-for="d in ['日', '一', '二', '三', '四', '五', '六']" :key="d" class="week-text">{{ d }}</span>
      </div>

      <div class="days-container">
        <div v-for="n in emptyDays" :key="'empty-' + n" class="day-cell empty"></div>
        <div v-for="day in daysInMonth" :key="day" class="day-cell" @click="onDayClick(day)">
          <div class="cell-inner" :class="{ 'today-highlight': isToday(day) && !getMoodForDay(day) }">
            <div v-if="getMoodForDay(day)" class="mood-face-box">
              <span class="mood-face">{{ getMoodEmoji(getMoodForDay(day)) }}</span>
              <div class="dot-indicator"></div>
            </div>
            <span v-else class="day-number">{{ day }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 数据库未就绪提示 -->
    <div v-if="tableMissing" class="missing-tip">
      ⚠️ 日历云端数据未就绪：请在 Supabase 控制台执行项目根目录的 supabase-setup.sql（为 diaries 表新增 date_str / images / writer 列）
    </div>

    <!-- 悬浮记一笔按钮 -->
    <div v-if="theme !== 'male'" class="floating-btn" @click="startNewDiary(todayStr)">
      <span class="pen-icon">✍️</span>
      <span class="btn-text">记一笔</span>
    </div>
    <div v-else class="floating-btn console-fab" @click="startNewDiary(todayStr)">
      <span class="pen-icon">✍️</span>
      <span class="btn-text">记一笔</span>
    </div>

    <!-- 弹窗 -->
    <div v-if="showModal" class="mask" @click="closeModal">
      <!-- 写/改模式 -->
      <div v-if="mode === 'write'" class="modal-card write-mode" @click.stop>
        <div class="modal-title">
          <span>{{ isEditing ? '修改回忆' : '记录今天' }}</span>
          <span class="modal-date">{{ targetDateStr }}</span>
        </div>

        <div class="mood-scroll scroll-area-x">
          <div class="mood-row">
            <div
              v-for="m in moodList"
              :key="m.key"
              class="mood-chip"
              :class="{ 'mood-active': newMood === m.key }"
              @click="newMood = m.key"
            >
              <span class="chip-emoji">{{ m.emoji }}</span>
              <span class="chip-txt">{{ m.name }}</span>
            </div>
          </div>
        </div>

        <textarea
          v-model="newContent"
          class="text-input"
          placeholder="今天发生了什么有趣的事？..."
          maxlength="2000"
        ></textarea>

        <div class="media-grid">
          <div v-for="(img, idx) in tempImages" :key="idx" class="media-item">
            <img :src="img" class="media-img" alt="" @click="previewImg(tempImages, idx)" />
            <div class="close-badge" @click.stop="removeImg(idx)">×</div>
          </div>
          <div v-if="tempImages.length < 9" class="media-add" @click="chooseImages">
            <span class="add-icon">+</span>
          </div>
        </div>

        <button class="primary-btn submit-btn" @click="submitDiary">保存日记</button>
      </div>

      <!-- 查看模式 -->
      <div v-if="mode === 'view'" class="modal-card view-mode" @click.stop>
        <div class="view-header">
          <div class="view-mood-icon">{{ getMoodEmoji(currentDetail.mood) }}</div>
          <div class="view-meta">
            <span class="view-date">{{ selectedDateStr }}</span>
            <span class="view-label">{{ getMoodName(currentDetail.mood) }}</span>
          </div>
          <div class="edit-link" @click="switchToEdit">修改 ></div>
        </div>

        <div class="view-scroll scroll-area">
          <span class="view-content">{{ currentDetail.content }}</span>
          <div v-if="currentDetail.images && currentDetail.images.length" class="view-images">
            <img
              v-for="(img, idx) in currentDetail.images"
              :key="idx"
              :src="img"
              class="view-img-item"
              alt=""
              @click="previewImg(currentDetail.images, idx)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diary-page {
  position: fixed;
  inset: 0;
  z-index: 100;
  padding: 14px 16px 40px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.theme-female { background: linear-gradient(180deg, #fffdf5 0%, #ffeef3 100%); }
.theme-male { background: var(--ios-bg); }
.theme-male::before {
  content: none; /* iOS 风格：无网格装饰线 */
}
.diary-page > * { position: relative; z-index: 1; }

.nav-header { text-align: center; margin-bottom: 20px; padding-top: 8px; }
.app-name { font-size: 24px; font-weight: 900; color: #4b3046; letter-spacing: 1px; display: block; margin-bottom: 5px; }
.sub-name { font-size: 13px; color: #8a7da6; letter-spacing: 1px; }

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  margin-bottom: 14px;
  border-radius: 16px;
  background: var(--ios-surface);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
}
.console-eyebrow { font-size: 11px; color: var(--ios-text-2); display: block; margin-bottom: 6px; }
.console-title { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: var(--ios-text); display: block; }
.console-sub { font-size: 12px; color: var(--ios-text-2); }
.console-actions { display: flex; gap: 8px; }
.console-btn { padding: 7px 14px; border-radius: 999px; border: 1px solid var(--ios-separator); color: var(--ios-accent); font-size: 12px; background: transparent; cursor: pointer; }
.console-btn.primary { background: var(--ios-accent); color: #ffffff; border-color: transparent; }

.back-bar { margin-bottom: 10px; }
.back-btn { font-size: 15px; color: #ff6b81; font-weight: 500; cursor: pointer; }
.theme-male .back-btn { color: var(--ios-accent); font-size: 14px; }

/* 日历卡片 */
.calendar-card {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
  padding: 18px;
  margin-bottom: 20px;
}
.theme-male .calendar-card {
  background: var(--ios-surface);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
}

.calendar-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
.current-date { display: flex; flex-direction: column; }
.year-text { font-size: 12px; color: #bbb; font-weight: bold; }
.month-text { font-size: 24px; color: #333; font-weight: 800; }
.theme-male .year-text { color: var(--ios-text-2); }
.theme-male .month-text { color: var(--ios-text); }

.btn-group { display: flex; align-items: center; gap: 8px; }
.arrow-btn {
  width: 34px;
  height: 34px;
  background: #f5f7fa;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 14px;
  color: #666;
  cursor: pointer;
}
.today-btn {
  width: 34px;
  height: 34px;
  background: #333;
  color: #fff;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
}
.theme-male .arrow-btn { background: var(--ios-surface-2); border-radius: 999px; color: var(--ios-text-2); border: none; }
.theme-male .today-btn { background: var(--ios-accent); color: #ffffff; border-radius: 999px; }

.week-header { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 12px; }
.week-text { text-align: center; font-size: 12px; color: #bbb; font-weight: bold; }
.theme-male .week-text { color: var(--ios-text-2); }

.days-container { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.day-cell { height: 46px; display: flex; justify-content: center; align-items: center; }
.cell-inner {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  background: transparent;
  transition: all 0.2s;
  cursor: pointer;
}
.theme-male .cell-inner { border-radius: 10px; border: none; }
.today-highlight { background: #e3f2fd; }
.today-highlight .day-number { color: #2196f3; font-weight: bold; }
.theme-male .today-highlight { background: rgba(10, 132, 255, 0.16); }
.theme-male .today-highlight .day-number { color: var(--ios-accent); }
.day-number { font-size: 15px; color: #333; font-weight: 500; }
.theme-male .day-number { color: var(--ios-text); }

.mood-face-box { display: flex; flex-direction: column; align-items: center; }
.mood-face { font-size: 24px; line-height: 1; }
.dot-indicator { width: 4px; height: 4px; background: #ff6b81; border-radius: 50%; margin-top: 3px; }
.theme-male .dot-indicator { background: var(--ios-accent); }

/* 悬浮按钮 */
.floating-btn {
  position: fixed;
  bottom: 32px;
  right: 20px;
  background: #333;
  color: white;
  padding: 12px 22px;
  border-radius: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  z-index: 110;
  cursor: pointer;
}
.theme-female .floating-btn { background: linear-gradient(135deg, #ffb7c5, #ffd93d); color: #5a3947; }
.console-fab { border-radius: 999px; background: var(--ios-accent); color: #ffffff; box-shadow: 0 8px 20px rgba(10, 132, 255, 0.35); }
.pen-icon { font-size: 18px; }
.btn-text { font-size: 14px; font-weight: bold; }

/* 弹窗 */
.mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(5px);
  z-index: 200;
  display: flex;
  justify-content: center;
  align-items: center;
}
.theme-male .mask { background: rgba(0, 0, 0, 0.6); }

.modal-card {
  width: 88%;
  max-width: 400px;
  background: #fff;
  border-radius: 24px;
  padding: 24px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  animation: popUp 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}
.theme-male .modal-card {
  background: var(--ios-surface);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
@keyframes popUp {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-title { margin-bottom: 18px; text-align: center; }
.modal-title span:first-child { font-size: 18px; font-weight: bold; color: #333; display: block; }
.modal-date { font-size: 12px; color: #999; margin-top: 5px; display: block; }
.theme-male .modal-title span:first-child { color: var(--ios-text); }
.theme-male .modal-date { color: var(--ios-text-2); }

.mood-scroll { white-space: nowrap; width: 100%; margin-bottom: 18px; overflow-x: auto; }
.mood-row { display: flex; gap: 10px; padding: 3px; }
.mood-chip {
  padding: 6px 14px;
  background: #f5f7fa;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s;
  border: 2px solid transparent;
  cursor: pointer;
  flex-shrink: 0;
}
.mood-active { background: #fff0f5; border-color: #ff6b81; transform: scale(1.05); }
.theme-male .mood-chip { background: var(--ios-fill); border-radius: 999px; border: 2px solid transparent; }
.theme-male .mood-active { background: rgba(10, 132, 255, 0.24); border-color: var(--ios-accent); }
.chip-emoji { font-size: 18px; }
.chip-txt { font-size: 12px; color: #666; }
.theme-male .chip-txt { color: var(--ios-text); }

.text-input {
  width: 100%;
  height: 150px;
  background: #f9fafc;
  border-radius: 14px;
  padding: 14px;
  font-size: 15px;
  color: #333;
  line-height: 1.6;
  margin-bottom: 18px;
  border: none;
  outline: none;
  font-family: inherit;
  resize: none;
}
.theme-male .text-input { background: var(--ios-fill); border-radius: 12px; color: var(--ios-text); border: none; }

.media-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
.media-item { position: relative; width: 60px; height: 60px; }
.media-img { width: 100%; height: 100%; border-radius: 10px; object-fit: cover; cursor: pointer; }
.theme-male .media-img { border-radius: 10px; }
.close-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ff4757;
  color: #fff;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  text-align: center;
  line-height: 16px;
  font-size: 12px;
  border: 2px solid #fff;
  cursor: pointer;
}
.media-add {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  border: 2px dashed #ddd;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
}
.theme-male .media-add { border-radius: 12px; border-color: var(--ios-text-3); }
.add-icon { font-size: 26px; color: #ccc; }
.theme-male .add-icon { color: var(--ios-text-2); }

.submit-btn {
  border: none;
  border-radius: 26px;
  font-size: 16px;
  font-weight: bold;
  height: 42px;
  cursor: pointer;
  font-family: inherit;
}
.theme-female .submit-btn { background: linear-gradient(135deg, #ffb7c5, #ffd93d); color: #5a3947; }
.theme-male .submit-btn { background: var(--ios-accent); color: #ffffff; border-radius: 999px; }

/* 查看模式 */
.view-header {
  display: flex;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 2px solid #eee;
  margin-bottom: 16px;
}
.theme-male .view-header { border-bottom: 0.5px solid var(--ios-separator); }
.view-mood-icon { font-size: 40px; margin-right: 12px; }
.view-meta { flex: 1; }
.view-date { font-size: 18px; font-weight: bold; color: #333; display: block; }
.view-label { font-size: 12px; color: #ff6b81; background: #fff0f5; padding: 2px 8px; border-radius: 8px; display: inline-block; margin-top: 4px; }
.edit-link { font-size: 13px; color: #999; padding: 6px; cursor: pointer; }
.theme-male .view-date { color: var(--ios-text); }
.theme-male .view-label { color: var(--ios-accent); background: rgba(10, 132, 255, 0.14); border-radius: 999px; }
.theme-male .edit-link { color: var(--ios-accent); }

.view-scroll { max-height: 50vh; }
.view-content { font-size: 15px; color: #444; line-height: 1.8; display: block; margin-bottom: 16px; white-space: pre-wrap; }
.view-img-item { width: 100%; border-radius: 14px; margin-bottom: 12px; }
.theme-male .view-content { color: var(--ios-text); }
.theme-male .view-img-item { border-radius: 12px; border: none; }

/* 数据库未就绪提示 */
.missing-tip {
  margin-bottom: 16px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.6;
  background: rgba(255, 196, 87, 0.15);
  border: 1px solid rgba(255, 180, 84, 0.4);
  color: #b8860b;
}
.theme-male .missing-tip { background: rgba(255, 159, 10, 0.12); border-color: rgba(255, 159, 10, 0.35); color: var(--ios-orange); }

.scroll-area-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
</style>
