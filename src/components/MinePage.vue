<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { showToast } from 'vant'
import { supabase } from '../supabase'
import { identity, identityProfiles, displayName } from '../identity'
import { theme } from '../theme'
import { vibrate } from '../utils/image'

const props = defineProps({
  active: { type: Boolean, default: true },
})
const emit = defineEmits(['open-page', 'switch-role'])

const showPokeEffect = ref(false)
const pokeSenderName = ref('')
let pokeTimer = null
const pokeCountA = ref(0) // user_a（大椰树）累计戳的次数
const pokeCountB = ref(0) // user_b（小椰宝）累计戳的次数
const progress = ref(99)

const themeClass = computed(() => (theme.value === 'male' ? 'theme-male' : 'theme-female'))
const myName = computed(() => displayName.value)
const myAvatar = computed(() => identityProfiles[identity.value].img)
const partnerName = computed(() => (identity.value === 'user_a' ? '小椰宝' : '大椰树'))
const roleLabel = computed(() => (identity.value === 'user_a' ? '女主角' : '男主角'))
const roleDesc = computed(() =>
  theme.value === 'male' ? '天才、聪明、太聪明' : '猪头、王树、陪伴'
)
// 我的/TA 的戳一戳次数展示
const myPokes = computed(() => (identity.value === 'user_a' ? pokeCountA.value : pokeCountB.value))
const partnerPokes = computed(() => (identity.value === 'user_a' ? pokeCountB.value : pokeCountA.value))

function goPage(name) {
  emit('open-page', name)
}

// ---- 戳一戳 ----
async function pokePartner() {
  vibrate(15)
  pokeSenderName.value = myName.value
  showPokeEffect.value = true
  setTimeout(() => {
    showPokeEffect.value = false
  }, 3500)
  try {
    const { error } = await supabase
      .from('love_poke')
      .insert([{ sender: identity.value, create_time: Date.now(), is_read: false }])
    if (error) throw error
    fetchPokeStats()
  } catch (e) {
    showToast('发送思念失败：请先在 Supabase 执行 supabase-setup.sql')
  }
}

function closePoke() {
  showPokeEffect.value = false
}

// 每 3 秒检查对方未读的戳（复刻 Linda1 轮询节奏）
function startReceivingPokes() {
  stopReceivingPokes()
  pokeTimer = setTimeout(async () => {
    if (props.active) await checkUnreadPokes()
    startReceivingPokes()
  }, 3000)
}
function stopReceivingPokes() {
  if (pokeTimer) {
    clearTimeout(pokeTimer)
    pokeTimer = null
  }
}

async function checkUnreadPokes() {
  if (showPokeEffect.value) return
  try {
    const partnerRole = identity.value === 'user_a' ? 'user_b' : 'user_a'
    const { data, error } = await supabase
      .from('love_poke')
      .select('id, sender')
      .eq('sender', partnerRole)
      .eq('is_read', false)
    if (error) return
    const unreadPokes = data || []
    if (unreadPokes.length > 0) {
      vibrate(400)
      pokeSenderName.value = partnerName.value
      showPokeEffect.value = true
      setTimeout(() => {
        showPokeEffect.value = false
      }, 4000)
      for (const poke of unreadPokes) {
        await supabase.from('love_poke').update({ is_read: true }).eq('id', poke.id)
      }
      fetchPokeStats()
    }
  } catch (e) {
    /* 静默 */
  }
}

async function fetchPokeStats() {
  try {
    const [resA, resB] = await Promise.all([
      supabase.from('love_poke').select('id', { count: 'exact', head: true }).eq('sender', 'user_a'),
      supabase.from('love_poke').select('id', { count: 'exact', head: true }).eq('sender', 'user_b'),
    ])
    pokeCountA.value = resA.count || 0
    pokeCountB.value = resB.count || 0
  } catch (e) {
    console.error('获取戳一戳统计失败', e)
  }
}

watch(
  () => props.active,
  (v) => {
    if (v) {
      fetchPokeStats()
      checkUnreadPokes()
    }
  }
)

onMounted(() => {
  startReceivingPokes()
  fetchPokeStats()
})

onUnmounted(() => {
  stopReceivingPokes()
})
</script>

<template>
  <div class="mine-page scroll-area" :class="themeClass">
    <!-- 女性视角 -->
    <template v-if="theme !== 'male'">
      <div class="profile-card" @click="emit('switch-role')">
        <div class="profile-left">
          <div class="avatar-wrap">
            <img class="avatar" :src="myAvatar" alt="" />
          </div>
          <div class="profile-meta">
            <span class="profile-name">{{ myName }}</span>
            <span class="profile-role">{{ roleLabel }}</span>
            <span class="profile-desc">{{ roleDesc }}</span>
            <div class="badge-row">
              <span class="badge-pill">树度 {{ progress }}%</span>
              <span class="badge-pill soft">温柔进行中</span>
            </div>
          </div>
        </div>
        <div class="profile-right">
          <div class="sweet-chip">Love</div>
          <div class="switch">⇄</div>
        </div>
      </div>

      <div class="action-grid">
        <div class="action-card diary-card" @click="goPage('diary')">
          <div class="card-icon">📖</div>
          <span class="card-title">心情日历</span>
          <span class="card-desc">记录点滴情绪</span>
        </div>
        <div class="action-card record-card" @click="goPage('record')">
          <div class="card-icon">✅</div>
          <span class="card-title">清单</span>
          <span class="card-desc">100件小事</span>
        </div>
        <div class="action-card gacha-card" @click="goPage('gacha')">
          <div class="card-icon">🎀</div>
          <span class="card-title">心动盲盒</span>
          <span class="card-desc">今天干点啥</span>
        </div>
        <div class="action-card quiz-card" @click="goPage('quiz')">
          <div class="card-icon">💞</div>
          <span class="card-title">默契挑战</span>
          <span class="card-desc">测一测同步率</span>
        </div>
        <div class="action-card nebula-card" @click="goPage('nebula')">
          <div class="card-icon">🌌</div>
          <span class="card-title">情绪星云</span>
          <span class="card-desc">捏卡片读情话</span>
        </div>
        <div class="action-card poke-card" @click="pokePartner">
          <div class="card-icon">💌</div>
          <span class="card-title">戳一戳</span>
          <span class="card-desc">霸屏想念你</span>
        </div>
      </div>

      <div class="menu-group">
        <div class="menu-title">猪的专属</div>
        <div class="menu-item">
          <span class="label">猪之蛋日</span>
          <span class="value">2006-09-28</span>
        </div>
        <div class="menu-item">
          <span class="label">enchanted</span>
          <span class="value">{{ partnerName }}</span>
        </div>
        <div class="menu-item">
          <span class="label">猪的状态</span>
          <span class="value">{{ theme === 'male' ? '数据同步中' : '温柔进行中' }}</span>
        </div>
        <div class="menu-item">
          <span class="label">戳一戳次数</span>
          <span class="value">我 {{ myPokes }} / TA {{ partnerPokes }}</span>
        </div>
      </div>

      <div class="footer-text">Love you to the moon and back</div>
    </template>

    <!-- 男性视角 -->
    <template v-else>
      <div class="console-hero">
        <div class="console-left">
          <span class="console-eyebrow">我的小宇宙</span>
          <span class="console-title">个人主页</span>
          <span class="console-sub">甜度 {{ progress }}%</span>
        </div>
        <div class="console-right" @click="emit('switch-role')">
          <img class="console-avatar" :src="myAvatar" alt="" />
          <div class="console-meta">
            <span class="console-name">{{ myName }}</span>
            <span class="console-role">{{ roleLabel }}</span>
          </div>
          <div class="console-switch">↺</div>
        </div>
      </div>

      <div class="console-stats">
        <div class="stat-card">
          <span class="stat-label">甜度</span>
          <span class="stat-value">{{ progress }}%</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">状态</span>
          <span class="stat-value">已连接</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">伴侣</span>
          <span class="stat-value">{{ partnerName }}</span>
        </div>
      </div>

      <div class="console-actions">
        <div class="action-row" @click="goPage('diary')">
          <div class="action-left">
            <div class="icon-box"><img class="icon-img" src="/static/icon-diary.png" alt="" /></div>
            <div>
              <span class="action-code">心情日历</span>
              <span class="action-desc">记录每天的心情</span>
            </div>
          </div>
          <span class="action-go">打开</span>
        </div>
        <div class="action-row" @click="goPage('record')">
          <div class="action-left">
            <div class="icon-box"><img class="icon-img" src="/static/icon-task.png" alt="" /></div>
            <div>
              <span class="action-code">清单</span>
              <span class="action-desc">我们的 100 件小事</span>
            </div>
          </div>
          <span class="action-go">打开</span>
        </div>
        <div class="action-row" @click="goPage('gacha')">
          <div class="action-left">
            <div class="icon-box"><img class="icon-img" src="/static/icon-box.png" alt="" /></div>
            <div>
              <span class="action-code">心动盲盒</span>
              <span class="action-desc">每天一个小惊喜</span>
            </div>
          </div>
          <span class="action-go">打开</span>
        </div>
        <div class="action-row" @click="goPage('quiz')">
          <div class="action-left">
            <div class="icon-box text-icon">默契</div>
            <div>
              <span class="action-code">默契挑战</span>
              <span class="action-desc">测测你们有多同步</span>
            </div>
          </div>
          <span class="action-go">打开</span>
        </div>
        <div class="action-row" @click="goPage('nebula')">
          <div class="action-left">
            <div class="icon-box text-icon">星云</div>
            <div>
              <span class="action-code">情绪星云</span>
              <span class="action-desc">开摄像头用手掌捏卡片</span>
            </div>
          </div>
          <span class="action-go">打开</span>
        </div>
        <div class="action-row" @click="pokePartner">
          <div class="action-left">
            <div class="icon-box"><img class="icon-img" src="/static/icon-poke.png" alt="" /></div>
            <div>
              <span class="action-code">戳一戳</span>
              <span class="action-desc">给 TA 发送一个心动信号</span>
            </div>
          </div>
          <span class="action-go">发送</span>
        </div>
      </div>

      <div class="console-table">
        <div class="table-row">
          <span class="table-label">谢谢</span>
          <span class="table-value">2005-02-08</span>
        </div>
        <div class="table-row">
          <span class="table-label">我的pet</span>
          <span class="table-value">{{ partnerName }}</span>
        </div>
        <div class="table-row">
          <span class="table-label">状态</span>
          <span class="table-value">开心</span>
        </div>
        <div class="table-row">
          <span class="table-label">戳一戳</span>
          <span class="table-value">我 {{ myPokes }} / TA {{ partnerPokes }}</span>
        </div>
      </div>
    </template>

    <!-- 戳一戳全屏动效 -->
    <div v-if="showPokeEffect" class="poke-overlay" @click="closePoke">
      <div class="poke-content">
        <div class="big-heart pulse">💖</div>
        <span class="poke-text">{{ pokeSenderName }} 正在疯狂想你！</span>
        <span class="poke-subtext">BiubiuBiu 接收到爱意了吗</span>
        <div class="poke-sparks">
          <span class="spark s1">✨</span>
          <span class="spark s2">💫</span>
          <span class="spark s3">✨</span>
          <span class="spark s4">💫</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mine-page {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  position: relative;
  min-height: 0;
}
.theme-female {
  background: linear-gradient(180deg, #fffaf4 0%, #f6eef7 100%);
}
.theme-female::before {
  content: "";
  position: absolute;
  top: -80px;
  right: -80px;
  width: 220px;
  height: 220px;
  background: radial-gradient(circle, rgba(255, 183, 197, 0.6), transparent 65%);
  opacity: 0.9;
  pointer-events: none;
}
.theme-female::after {
  content: "";
  position: absolute;
  bottom: 80px;
  left: -60px;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(255, 217, 61, 0.35), transparent 60%);
  opacity: 0.7;
  pointer-events: none;
}
.theme-male {
  background: var(--ios-bg);
}
.theme-male::before {
  content: none; /* iOS 风格：无网格装饰线 */
}
.mine-page > * { position: relative; z-index: 1; }

/* 女性视角资料卡 */
.profile-card {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px;
  border-radius: 28px;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 36px rgba(129, 100, 160, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.7);
  cursor: pointer;
}
.profile-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.45), transparent 45%),
    radial-gradient(circle at bottom left, rgba(255, 217, 61, 0.18), transparent 40%);
  opacity: 0.9;
}
.profile-left { position: relative; z-index: 2; display: flex; gap: 14px; align-items: center; min-width: 0; }
.avatar-wrap {
  width: 78px;
  height: 78px;
  padding: 3px;
  border-radius: 26px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 10px 18px rgba(255, 183, 197, 0.25);
}
.avatar { width: 100%; height: 100%; border-radius: 22px; object-fit: cover; }
.profile-meta { flex: 1; min-width: 0; }
.profile-name { display: block; font-size: 22px; font-weight: 800; margin-bottom: 4px; }
.profile-role {
  display: inline-flex;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 183, 197, 0.35);
  color: #6b4b5a;
  margin-bottom: 8px;
}
.profile-desc { display: block; font-size: 13px; line-height: 1.7; color: #7b6579; }
.badge-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.badge-pill {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.75);
  color: #8a6a7f;
  border: 1px solid rgba(255, 183, 197, 0.35);
}
.badge-pill.soft { background: rgba(255, 217, 61, 0.18); border-color: rgba(255, 217, 61, 0.35); }
.profile-right { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.sweet-chip {
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 6px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, #ffb7c5, #ffd93d);
  color: #5a3947;
  box-shadow: 0 8px 16px rgba(255, 183, 197, 0.3);
}
.switch {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.7);
  color: #7a5c68;
}

/* 功能入口宫格 */
.action-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
.action-card { padding: 16px; border-radius: 22px; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06); cursor: pointer; }
.theme-female .action-card { background: rgba(255, 255, 255, 0.9); border: 1px solid rgba(255, 183, 197, 0.25); }
.card-icon {
  width: 46px;
  height: 46px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-bottom: 10px;
  box-shadow: 0 8px 18px rgba(255, 183, 197, 0.2);
}
.diary-card .card-icon { background: linear-gradient(135deg, rgba(255, 183, 197, 0.35), rgba(255, 255, 255, 0.8)); }
.record-card .card-icon { background: linear-gradient(135deg, rgba(255, 217, 61, 0.35), rgba(255, 255, 255, 0.8)); }
.gacha-card .card-icon { background: linear-gradient(135deg, rgba(255, 154, 158, 0.32), rgba(255, 255, 255, 0.8)); }
.quiz-card .card-icon { background: linear-gradient(135deg, rgba(143, 211, 244, 0.32), rgba(255, 255, 255, 0.8)); }
.nebula-card .card-icon { background: linear-gradient(135deg, rgba(161, 140, 209, 0.38), rgba(48, 43, 99, 0.5)); }
.poke-card .card-icon { background: linear-gradient(135deg, rgba(255, 183, 197, 0.3), rgba(255, 217, 61, 0.2)); }
.card-title { display: block; font-size: 15px; font-weight: 800; margin-bottom: 4px; color: #4b3046; }
.card-desc { display: block; font-size: 11px; opacity: 0.7; color: #4b3046; }

/* 专属密码菜单 */
.menu-group { padding: 18px; border-radius: 24px; margin-bottom: 16px; }
.theme-female .menu-group { background: rgba(255, 255, 255, 0.72); }
.menu-title { display: block; font-size: 14px; font-weight: 800; margin-bottom: 12px; color: #4b3046; }
.menu-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.menu-item:last-child { border-bottom: none; }
.label { font-size: 14px; color: #4b3046; }
.value { font-size: 13px; opacity: 0.72; color: #4b3046; }

.footer-text { text-align: center; font-size: 12px; opacity: 0.6; margin: 8px 0 16px; }

/* 男性视角（iOS 设置页风） */
.console-hero {
  margin-bottom: 16px;
  padding: 16px;
  border-radius: 16px;
  background: var(--ios-surface);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.console-left { display: flex; flex-direction: column; gap: 6px; }
.console-eyebrow { font-size: 11px; color: var(--ios-text-2); }
.console-title { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--ios-text); }
.console-sub { font-size: 12px; color: var(--ios-text-2); }
.console-right {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--ios-surface-2);
  padding: 8px 10px;
  border-radius: 12px;
  cursor: pointer;
}
.console-avatar { width: 46px; height: 46px; border-radius: 12px; object-fit: cover; }
.console-meta { display: flex; flex-direction: column; gap: 4px; }
.console-name { font-size: 14px; font-weight: 600; color: var(--ios-text); }
.console-role { font-size: 11px; color: var(--ios-text-2); }
.console-switch {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ios-accent);
  background: rgba(10, 132, 255, 0.14);
  font-size: 12px;
}

.console-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.console-stats .stat-card {
  padding: 12px 10px;
  border-radius: var(--ios-radius);
  background: var(--ios-surface);
  text-align: center;
}
.stat-label { display: block; font-size: 11px; color: var(--ios-text-2); }
.stat-value { display: block; margin-top: 4px; font-size: 17px; font-weight: 700; color: var(--ios-text); }

.console-actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-radius: var(--ios-radius);
  background: var(--ios-surface);
  cursor: pointer;
}
.action-row:active { background: var(--ios-surface-3); }
.action-left { display: flex; align-items: center; gap: 12px; }
.icon-box {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: rgba(10, 132, 255, 0.14);
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-img { width: 20px; height: 20px; }
.text-icon { color: var(--ios-accent); font-size: 10px; font-weight: 600; }
.action-code { display: block; font-size: 12px; color: var(--ios-text-2); margin-bottom: 4px; }
.action-desc { display: block; font-size: 12px; color: var(--ios-text-2); }
.action-go {
  font-size: 11px;
  color: #ffffff;
  background: var(--ios-accent);
  padding: 6px 12px;
  border-radius: 999px;
}

.console-table {
  padding: 6px 14px;
  border-radius: var(--ios-radius);
  background: var(--ios-surface);
  margin-bottom: 16px;
}
.table-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 0.5px solid var(--ios-separator);
}
.table-row:last-child { border-bottom: none; }
.table-label { font-size: 13px; color: var(--ios-text); }
.table-value { font-size: 13px; color: var(--ios-text-2); }

/* 戳一戳全屏动效 */
.poke-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  animation: pokeFade 0.2s ease-out;
}
@keyframes pokeFade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.poke-content { text-align: center; }
.big-heart { font-size: 110px; margin-bottom: 16px; }
.pulse { animation: heartPop 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) both, heartPulse 1.2s 0.3s ease-in-out infinite; }
.poke-text { display: block; color: #fff; font-size: 18px; font-weight: 800; margin-bottom: 8px; }
.poke-subtext { display: block; color: rgba(255, 255, 255, 0.8); font-size: 13px; }
.poke-sparks { position: relative; width: 140px; height: 40px; margin: 10px auto 0; }
.spark { position: absolute; font-size: 18px; opacity: 0; animation: sparkle 1.6s ease-in-out infinite; }
.s1 { left: 0; top: 10px; animation-delay: 0s; }
.s2 { left: 35px; top: 0; animation-delay: 0.3s; }
.s3 { left: 70px; top: 12px; animation-delay: 0.6s; }
.s4 { left: 105px; top: 2px; animation-delay: 0.9s; }
@keyframes heartPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}
@keyframes sparkle {
  0% { transform: translateY(0); opacity: 0; }
  30% { opacity: 1; }
  60% { transform: translateY(-6px); opacity: 0.9; }
  100% { transform: translateY(-12px); opacity: 0; }
}
@keyframes heartPop {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* 无障碍：减弱动态效果时爱心/星光只保留透明度变化 */
@media (prefers-reduced-motion: reduce) {
  .poke-overlay { animation: none; }
  .pulse { animation: heartPop 0.2s ease-out both; }
  .spark { animation-name: sparkleStill; }
}
@keyframes sparkleStill {
  0% { opacity: 0; }
  30% { opacity: 1; }
  60% { opacity: 0.9; }
  100% { opacity: 0; }
}
</style>
