<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { showToast } from 'vant'
import { supabase } from './supabase'
import { identity, identityProfiles, identityNames } from './identity'
import { theme, setTheme } from './theme'
import ChatRoom from './components/ChatRoom.vue'
import MomentCircle from './components/MomentCircle.vue'
import MinePage from './components/MinePage.vue'
import DiaryPage from './components/DiaryPage.vue'
import RecordList from './components/RecordList.vue'
import GachaBox from './components/GachaBox.vue'
import QuizGame from './components/QuizGame.vue'

// ---- 全局状态 ----
const activeTab = ref(0) // 0 朋友圈 / 1 秘密基地 / 2 我的
const showHome = ref(true) // 首页主题选择（复刻 Linda1 index 页，每次启动先见）
const activePage = ref(null) // 子页：diary / record / gacha / quiz
const showSwitch = ref(false)
const chatUnread = ref(0)

const themeClass = computed(() => (theme.value === 'male' ? 'theme-male' : 'theme-female'))

// ---- 身份切换（复刻 Linda1 switchRole：身份与主题联动，无需刷新） ----
function switchIdentity(action) {
  showSwitch.value = false
  if (!action || action.value === identity.value) return
  identity.value = action.value // 主题由 theme.js 的 watch 自动跟随
  showToast('身份切换成功')
}

function openSwitch() {
  showSwitch.value = true
}

// ---- 首页入口（复刻 Linda1 index.vue） ----
const homeEntries = [
  { label: '朋友圈', type: 'tab', value: 0 },
  { label: '秘密基地', type: 'tab', value: 1 },
  { label: '我的', type: 'tab', value: 2 },
  { label: '恋爱清单', type: 'page', value: 'record' },
  { label: '心情日历', type: 'page', value: 'diary' },
  { label: '心动盲盒', type: 'page', value: 'gacha' },
]

function homeGo(entry) {
  showHome.value = false
  if (entry.type === 'tab') {
    activeTab.value = entry.value
  } else {
    activePage.value = entry.value
  }
}

function pickTheme(gender) {
  setTheme(gender)
}

// ---- 子页路由 ----
function openPage(name) {
  activePage.value = name
}
function closePage() {
  activePage.value = null
}

// ---- 全局未读轮询（复刻 Linda1 App.vue 的 30 秒红点检查） ----
const READ_KEY = 'chat_last_read'
let pollTimer = null

async function checkUnread() {
  if (document.hidden) return
  try {
    let lastRead = localStorage.getItem(READ_KEY)
    if (!lastRead) {
      lastRead = new Date().toISOString()
      localStorage.setItem(READ_KEY, lastRead)
    }
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', lastRead)
    if (error) return
    chatUnread.value = activeTab.value === 1 ? 0 : Math.max(0, count || 0)
  } catch (e) {
    /* 静默失败 */
  }
}

// ChatRoom 活跃时同步已读水位
function onChatRead() {
  localStorage.setItem(READ_KEY, new Date().toISOString())
  chatUnread.value = 0
}

onMounted(() => {
  checkUnread()
  pollTimer = setInterval(checkUnread, 30000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="app-shell" :class="themeClass">
    <!-- 首页：主题选择 + 功能入口（复刻 Linda1 index.vue） -->
    <div v-if="showHome" class="home-overlay">
      <div class="orb orb-one"></div>
      <div class="orb orb-two"></div>
      <div class="hero">
        <span class="eyebrow">Exclusive Love Space</span>
        <span class="title">专属秘密基地</span>
        <span class="subtitle">选择你们今天想要的爱意语气</span>
      </div>

      <div class="mode-switch">
        <div class="mode-card" :class="{ active: theme === 'female' }" @click="pickTheme('female')">
          <span class="mode-title">女性视角</span>
          <span class="mode-desc">治愈系 · 云端呼吸</span>
        </div>
        <div class="mode-card" :class="{ active: theme === 'male' }" @click="pickTheme('male')">
          <span class="mode-title">男性视角</span>
          <span class="mode-desc">极客感 · 赛博秩序</span>
        </div>
      </div>

      <div class="entry-list">
        <div v-for="entry in homeEntries" :key="entry.label" class="entry-item" @click="homeGo(entry)">
          {{ entry.label }}
        </div>
      </div>
    </div>

    <!-- 三大主页面（复刻 Linda1 tabBar：朋友圈 / 秘密基地 / 我的） -->
    <template v-if="!showHome">
      <div class="app-content">
        <MomentCircle v-show="activeTab === 0" :active="activeTab === 0" />
        <ChatRoom v-show="activeTab === 1" :active="activeTab === 1" @switch-role="openSwitch" @chat-read="onChatRead" />
        <MinePage v-show="activeTab === 2" :active="activeTab === 2" @open-page="openPage" @switch-role="openSwitch" />
      </div>

      <van-tabbar v-model="activeTab" class="app-tabbar" safe-area-inset-bottom>
        <van-tabbar-item>
          <template #icon>
            <span class="tab-icon">📷</span>
          </template>
          朋友圈
        </van-tabbar-item>
        <van-tabbar-item :badge="chatUnread > 0 ? chatUnread : ''">
          <template #icon>
            <span class="tab-icon">💬</span>
          </template>
          秘密基地
        </van-tabbar-item>
        <van-tabbar-item>
          <template #icon>
            <span class="tab-icon">🌳</span>
          </template>
          我的
        </van-tabbar-item>
      </van-tabbar>
    </template>

    <!-- 子页：心情日历 / 恋爱清单 / 心动盲盒 / 默契挑战 -->
    <transition name="page-up">
      <DiaryPage v-if="activePage === 'diary'" @close="closePage" />
    </transition>
    <transition name="page-up">
      <RecordList v-if="activePage === 'record'" @close="closePage" />
    </transition>
    <transition name="page-up">
      <GachaBox v-if="activePage === 'gacha'" @close="closePage" />
    </transition>
    <transition name="page-up">
      <QuizGame v-if="activePage === 'quiz'" @close="closePage" />
    </transition>

    <!-- 身份切换弹窗（主题跟随身份联动） -->
    <van-action-sheet
      v-model:show="showSwitch"
      :actions="[
        { name: `${identityProfiles.user_a.avatar} 我是${identityNames.user_a}`, value: 'user_a' },
        { name: `${identityProfiles.user_b.avatar} 我是${identityNames.user_b}`, value: 'user_b' },
      ]"
      cancel-text="取消"
      @select="switchIdentity"
    />
  </div>
</template>

<style scoped>
.app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: #0f0f18;
}

/* ============ 首页（Linda1 index.vue 复刻） ============ */
.home-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  padding: 32px 18px;
  overflow-y: auto;
  background: linear-gradient(180deg, #fffdf5 0%, #ffe9ef 100%);
}
.home-overlay.theme-male {
  background: linear-gradient(180deg, #121212 0%, #1b1d2a 100%);
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(38px);
  opacity: 0.5;
  pointer-events: none;
}
.orb-one {
  width: 220px;
  height: 220px;
  top: -40px;
  right: -70px;
}
.orb-two {
  width: 240px;
  height: 240px;
  bottom: 120px;
  left: -100px;
}
.theme-female .orb-one {
  background: rgba(255, 183, 197, 0.55);
}
.theme-female .orb-two {
  background: rgba(255, 217, 61, 0.28);
}
.theme-male .orb-one {
  background: rgba(0, 229, 255, 0.25);
}
.theme-male .orb-two {
  background: rgba(106, 125, 255, 0.22);
}

.hero {
  position: relative;
  z-index: 2;
  margin-bottom: 18px;
}
.eyebrow {
  display: block;
  font-size: 11px;
  letter-spacing: 2px;
  opacity: 0.7;
  margin-bottom: 10px;
}
.title {
  display: block;
  font-size: 28px;
  font-weight: 800;
  margin-bottom: 8px;
}
.subtitle {
  display: block;
  font-size: 13px;
  line-height: 1.7;
  opacity: 0.82;
}

.mode-switch {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 18px;
}
.mode-card {
  padding: 16px;
  border-radius: 22px;
  border: 1px solid transparent;
}
.theme-female .mode-card {
  background: rgba(255, 255, 255, 0.76);
}
.theme-male .mode-card {
  background: rgba(255, 255, 255, 0.06);
}
.mode-card.active {
  border-color: currentColor;
}
.mode-title {
  display: block;
  font-size: 15px;
  font-weight: 800;
  margin-bottom: 6px;
}
.mode-desc {
  display: block;
  font-size: 12px;
  opacity: 0.72;
}

.entry-list {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.entry-item {
  padding: 18px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
}
.theme-female .entry-item {
  background: rgba(255, 255, 255, 0.84);
}
.theme-male .entry-item {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(0, 229, 255, 0.12);
}

/* ============ 主内容区 ============ */
.app-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.app-tabbar {
  flex-shrink: 0;
  background: #ffffff;
}
.theme-male .app-tabbar {
  background: #0d1118;
}
.theme-male .app-tabbar :deep(.van-tabbar-item) {
  color: rgba(159, 200, 212, 0.8);
}
.theme-male .app-tabbar :deep(.van-tabbar-item--active) {
  color: #00e5ff;
}
.tab-icon {
  font-size: 20px;
  line-height: 1;
}

/* ============ 子页上滑过渡 ============ */
.page-up-enter-active,
.page-up-leave-active {
  transition: transform 0.28s ease, opacity 0.28s ease;
}
.page-up-enter-from,
.page-up-leave-to {
  transform: translateY(100%);
  opacity: 0.6;
}
</style>
