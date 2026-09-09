<script setup>
import { ref, computed } from 'vue'
import { theme } from '../theme'
import { vibrate } from '../utils/image'

const emit = defineEmits(['close'])

const isShaking = ref(false)
const showResult = ref(false)
const currentPrize = ref({})

const themeClass = computed(() => (theme.value === 'male' ? 'theme-male' : 'theme-female'))

// 🎁 超甜的内置盲盒奖池（完整复刻 Linda1 prizePool）
const prizePool = [
  { type: '🍽️ 今日吃什么', title: '三选一去吃', desc: '今晚三选一：火锅/烤肉/小吃摊，抽中者选。', emoji: '🍜', color: '#f6d365' },
  { type: '🥤 立刻投喂', title: '点一杯奶茶', desc: '现在给对方点一杯指定口味的奶茶或果茶。', emoji: '🧋', color: '#ffecd2' },
  { type: '🍰 甜品预约', title: '去吃小甜品', desc: '这周内找时间一起吃蛋糕/冰淇淋。', emoji: '🍰', color: '#ffdfba' },
  { type: '🍢 街边小吃', title: '买一份小吃', desc: '见面时主动买一份路边小吃给对方。', emoji: '🌭', color: '#ffb199' },
  { type: '🧺 零食补给', title: '补一袋零食', desc: '给对方买一小袋喜欢的零食或饮料。', emoji: '🛍️', color: '#c2e9fb' },
  { type: '🌃 晚风散步', title: '走一段路', desc: '今晚一起散步 20 分钟，聊两件今天的事。', emoji: '🌙', color: '#8fd3f4' },
  { type: '📞 语音时光', title: '打 10 分钟电话', desc: '睡前打个 10 分钟语音，互道晚安。', emoji: '☎️', color: '#a8edea' },
  { type: '💬 一句话', title: '说一句喜欢你', desc: '给对方发一句真诚的情话，不准敷衍。', emoji: '💌', color: '#f6d365' },
  { type: '🎁 小礼物', title: '送个小物件', desc: '送一个 20 元内的小礼物（发夹/钥匙扣/小零食）。', emoji: '🎁', color: '#fccb90' },
  { type: '📸 记录今天', title: '拍一张合照', desc: '今天拍一张合照或同款姿势照片留念。', emoji: '📷', color: '#a18cd1' },
  { type: '🤝 小互动', title: '牵手 5 分钟', desc: '见面时十指紧扣走 5 分钟。', emoji: '👫', color: '#fca3cc' },
  { type: '🫂 拥抱充电', title: '抱一下 30 秒', desc: '见面时给对方一个 30 秒的拥抱。', emoji: '🤗', color: '#ff6b81' },
  { type: '📝 小纸条', title: '写一张便签', desc: '写一句暖心话，拍照发给对方或当面给。', emoji: '📝', color: '#cfd9df' },
  { type: '🎵 分享一首歌', title: '发一首歌', desc: '分享一首最近常听的歌，说一句为什么喜欢。', emoji: '🎵', color: '#c2e9fb' },
  { type: '🧹 小帮忙', title: '做件小事', desc: '今天帮对方做一件小事（拿外卖/拎包/倒水）。', emoji: '🧸', color: '#fbc2eb' },
  { type: '🌇 今日约会', title: '安排个小约会', desc: '这周内找个轻松地点见面或视频。', emoji: '🌆', color: '#ff9a9e' },
]

// 🎲 点击抽盲盒
function startDraw() {
  if (isShaking.value) return
  // 1. 触发物理震动（增加真实感）
  vibrate(400)
  // 2. 开始摇晃动画
  isShaking.value = true
  // 3. 模拟拆盲盒的过程（等待 1.5 秒）
  setTimeout(() => {
    isShaking.value = false
    openBox()
  }, 1500)
}

// 🎁 开奖逻辑
function openBox() {
  const randomIndex = Math.floor(Math.random() * prizePool.length)
  currentPrize.value = prizePool[randomIndex]
  // 再次震动提示开奖，并弹出结果
  vibrate(15)
  showResult.value = true
}

// ❌ 关闭弹窗
function closeResult() {
  showResult.value = false
}

function goBack() {
  emit('close')
}
</script>

<template>
  <div class="gacha-page" :class="themeClass">
    <!-- 导航栏（双主题） -->
    <template v-if="theme !== 'male'">
      <div class="nav-bar">
        <span class="back-btn" @click="goBack">❮ 返回</span>
        <span class="title">心动盲盒 🎁</span>
        <span class="placeholder"></span>
      </div>
    </template>
    <template v-else>
      <div class="nav-bar console-bar">
        <span class="back-btn" @click="goBack">❮ 返回</span>
        <span class="title">心动盲盒 🎁</span>
        <span class="placeholder"></span>
      </div>
    </template>

    <div class="gacha-stage">
      <div class="tips">不知道今天干嘛？抽个盲盒吧！</div>

      <div class="box-container" :class="{ shaking: isShaking }" @click="startDraw">
        <div class="magic-box">
          <span class="box-emoji">📦</span>
        </div>
        <div class="box-shadow"></div>
      </div>

      <button
        class="draw-btn"
        :class="{ 'btn-disabled': isShaking, 'console-btn': theme === 'male' }"
        @click="startDraw"
      >
        {{ isShaking ? '正在开启...' : '🔮 开启今日惊喜' }}
      </button>
    </div>

    <!-- 开奖弹窗 -->
    <div v-if="showResult" class="result-overlay" @click="closeResult">
      <div class="result-card" :class="{ 'console-card': theme === 'male' }" @click.stop>
        <div class="card-header">
          <div class="glow-bg"></div>
          <span class="result-emoji">{{ currentPrize.emoji }}</span>
        </div>

        <div class="card-body">
          <span class="prize-type" :style="{ color: currentPrize.color }">{{ currentPrize.emoji }} {{ currentPrize.type }}</span>
          <span class="prize-title">{{ currentPrize.desc }}</span>
        </div>

        <button class="accept-btn" :class="{ 'console-btn': theme === 'male' }" @click="closeResult">
          {{ theme === 'male' ? 'CONFIRM' : '美滋滋地收下 🥰' }}
        </button>
      </div>

      <div class="confetti-box">
        <span class="confetti c1">✨</span>
        <span class="confetti c2">🎉</span>
        <span class="confetti c3">⭐</span>
        <span class="confetti c4">✨</span>
        <span class="confetti c5">🎊</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gacha-page {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.theme-female {
  background: linear-gradient(135deg, #fffdf5 0%, #ffe7ef 100%);
  color: #4b3046;
}
/* 全屏浮层直接铺日落实景，与 app-shell 同款暗化渐变，避免宽屏露出黑边 */
.theme-male {
  background:
    linear-gradient(180deg, rgba(8, 12, 28, 0.30) 0%, rgba(8, 12, 28, 0.46) 55%, rgba(8, 12, 28, 0.62) 100%),
    url('/sunset-bg.jpg') center / cover no-repeat;
  color: var(--ios-text);
}
.theme-male::before {
  content: none; /* iOS 风格：无网格装饰线 */
}
.gacha-page > * { position: relative; z-index: 1; }

/* 自定义导航栏 */
.nav-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px 0;
  height: 44px;
}
.back-btn { font-size: 16px; color: #ff6b81; font-weight: 500; width: 60px; cursor: pointer; }
.title { font-size: 18px; font-weight: bold; color: #4b3046; }
.placeholder { width: 60px; text-align: right; }
.console-bar .back-btn { color: var(--ios-accent); font-size: 14px; }
.console-bar .title { color: var(--ios-text); }
.console-bar .placeholder { color: var(--ios-text-2); font-size: 12px; }

/* 盲盒舞台区 */
.gacha-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding-bottom: 10vh;
}
.tips { font-size: 16px; color: #8a7da6; margin-bottom: 40px; letter-spacing: 1px; }
.theme-male .tips { color: var(--ios-text-2); }

.box-container { position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; }

.magic-box {
  width: 150px;
  height: 150px;
  background: #fff;
  border-radius: 30px;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: 0 20px 50px rgba(255, 107, 129, 0.2);
  border: 4px solid #fff;
  animation: float 3s ease-in-out infinite; /* 平时缓慢悬浮 */
  z-index: 2;
}
.theme-male .magic-box {
  background: var(--ios-surface);
  border-radius: 32px;
  border: none;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}
.box-emoji { font-size: 80px; }

.box-shadow {
  width: 100px;
  height: 15px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 50%;
  margin-top: 20px;
  animation: shadowFloat 3s ease-in-out infinite;
}
.theme-male .box-shadow { background: rgba(120, 120, 128, 0.35); border-radius: 50%; }

/* 平时悬浮动画 */
@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-15px); }
  100% { transform: translateY(0px); }
}
@keyframes shadowFloat {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(1); opacity: 1; }
}

/* 狂暴摇晃动画（点击后触发） */
.shaking .magic-box { animation: hardShake 0.4s infinite; }
.shaking .box-shadow { animation: none; opacity: 0.5; }

@keyframes hardShake {
  0% { transform: translate(1px, 1px) rotate(0deg) scale(1); }
  10% { transform: translate(-3px, -2px) rotate(-5deg) scale(1.05); }
  20% { transform: translate(-3px, 0px) rotate(5deg) scale(1.05); }
  30% { transform: translate(3px, 2px) rotate(0deg) scale(1.05); }
  40% { transform: translate(1px, -1px) rotate(5deg) scale(1.05); }
  50% { transform: translate(-1px, 2px) rotate(-5deg) scale(1.05); }
  60% { transform: translate(-3px, 1px) rotate(0deg) scale(1.05); }
  70% { transform: translate(3px, 1px) rotate(-5deg) scale(1.05); }
  80% { transform: translate(-1px, -1px) rotate(5deg) scale(1.05); }
  90% { transform: translate(1px, 2px) rotate(0deg) scale(1.05); }
  100% { transform: translate(1px, -2px) rotate(-5deg) scale(1.05); }
}

/* 抽奖按钮 */
.draw-btn {
  margin-top: 60px;
  width: 220px;
  height: 50px;
  background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  border-radius: 25px;
  box-shadow: 0 8px 20px rgba(255, 154, 158, 0.4);
  border: none;
  transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  cursor: pointer;
  font-family: inherit;
}
.console-btn.draw-btn {
  background: var(--ios-accent);
  color: #ffffff;
  border-radius: 999px;
  box-shadow: 0 8px 20px rgba(10, 132, 255, 0.35);
}
.draw-btn:active { transform: scale(0.95); }
.btn-disabled { background: #ccc; box-shadow: none; pointer-events: none; }

/* 开奖弹窗（毛玻璃） */
.result-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  z-index: 999;
  display: flex;
  justify-content: center;
  align-items: center;
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.result-card {
  width: 80%;
  background: #fff;
  border-radius: 30px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
  animation: popUp 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  position: relative;
  z-index: 1000;
  padding-bottom: 25px;
}
.console-card {
  background: var(--ios-surface);
  border-radius: 16px;
  border: none;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}
@keyframes popUp {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.card-header {
  width: 100%;
  height: 120px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #fffafb;
  overflow: hidden;
}
.console-card .card-header { background: var(--ios-surface-2); }
.glow-bg {
  position: absolute;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, rgba(255, 218, 224, 1) 0%, rgba(255, 255, 255, 0) 70%);
  animation: pulse 2s infinite alternate;
}
@keyframes pulse {
  0% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 0.3; }
}

.result-emoji {
  font-size: 60px;
  z-index: 2;
  text-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
  animation: dropDown 0.5s ease-out;
}
@keyframes dropDown {
  from { transform: translateY(-50px) scale(0.5); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

.card-body { padding: 20px 25px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.prize-type { font-size: 14px; font-weight: 800; margin-bottom: 12px; letter-spacing: 1px; }
.prize-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 15px; }
.prize-desc { font-size: 14px; color: #666; line-height: 1.6; }
.console-card .prize-title { color: var(--ios-text); }
.console-card .prize-desc { color: var(--ios-text-2); }

.accept-btn {
  margin-top: 10px;
  width: 80%;
  height: 44px;
  background: linear-gradient(135deg, #ffb7c5, #ffd93d);
  color: #5a3947;
  font-size: 15px;
  font-weight: bold;
  border-radius: 22px;
  border: none;
  cursor: pointer;
  font-family: inherit;
}
.console-btn.accept-btn { background: var(--ios-accent); color: #ffffff; border-radius: 999px; }

/* 满屏撒花特效 */
.confetti-box { position: absolute; width: 100%; height: 100%; pointer-events: none; overflow: hidden; top: 0; left: 0; }
.confetti { position: absolute; font-size: 24px; top: -50px; animation: fall 3s linear infinite; }
.c1 { left: 15%; animation-delay: 0s; }
.c2 { left: 35%; animation-delay: 0.5s; font-size: 30px; }
.c3 { left: 55%; animation-delay: 0.2s; }
.c4 { left: 75%; animation-delay: 0.8s; font-size: 20px; }
.c5 { left: 90%; animation-delay: 0.4s; }

@keyframes fall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
}

/* 无障碍：减弱动态效果时关闭悬浮/摇晃/撒花位移，保留淡入 */
@media (prefers-reduced-motion: reduce) {
  .magic-box { animation: none; }
  .box-shadow { animation: none; }
  .shaking .magic-box { animation: fadeIn 0.4s ease-in-out infinite alternate; }
  .result-emoji { animation: fadeIn 0.3s ease-out; }
  .glow-bg { animation: none; opacity: 0.4; }
  .confetti { display: none; }
}
</style>
