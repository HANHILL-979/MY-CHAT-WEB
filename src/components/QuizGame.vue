<script setup>
import { ref, computed, onMounted } from 'vue'
import { theme } from '../theme'
import { identity, otherIdentity, nameOf } from '../identity'
import { vibrate } from '../utils/image'

const emit = defineEmits(['close'])

const phase = ref('self')
const selfPick = ref('')
const partnerPick = ref('')
const roundIndex = ref(0)
const score = ref(0)
const streak = ref(0)
const bestScore = ref(0)
const showResult = ref(false)
const lastMatch = ref(false)
const completed = ref(false)
const history = ref([])

const themeClass = computed(() => (theme.value === 'male' ? 'theme-male' : 'theme-female'))

// 🎯 默契挑战题库（完整复刻 Linda1 questions）
const questions = [
  {
    title: '今晚最想一起做什么？',
    options: [
      { key: 'walk', emoji: '🌙', label: '散步' },
      { key: 'movie', emoji: '🎬', label: '电影' },
      { key: 'snack', emoji: '🍜', label: '夜宵' },
      { key: 'call', emoji: '☎️', label: '聊天' },
    ],
  },
  {
    title: '对方今天最需要哪种能量？',
    options: [
      { key: 'hug', emoji: '🫂', label: '抱抱' },
      { key: 'quiet', emoji: '🍵', label: '安静' },
      { key: 'laugh', emoji: '😄', label: '开心' },
      { key: 'food', emoji: '🥤', label: '投喂' },
    ],
  },
  {
    title: '下一次约会更适合哪里？',
    options: [
      { key: 'park', emoji: '🌳', label: '公园' },
      { key: 'mall', emoji: '🛍️', label: '商场' },
      { key: 'sea', emoji: '🌊', label: '海边' },
      { key: 'home', emoji: '🏠', label: '家里' },
    ],
  },
  {
    title: '吵架后最想听到哪句话？',
    options: [
      { key: 'sorry', emoji: '💌', label: '我错啦' },
      { key: 'miss', emoji: '🥺', label: '想你了' },
      { key: 'hug', emoji: '🤗', label: '抱一下' },
      { key: 'eat', emoji: '🍰', label: '去吃甜的' },
    ],
  },
  {
    title: '今天的恋爱关键词是？',
    options: [
      { key: 'sweet', emoji: '🍯', label: '甜' },
      { key: 'safe', emoji: '🛡️', label: '安心' },
      { key: 'hot', emoji: '🔥', label: '热烈' },
      { key: 'soft', emoji: '☁️', label: '温柔' },
    ],
  },
]

const currentQuestion = computed(() => questions[roundIndex.value] || questions[0])
const currentPick = computed(() => (phase.value === 'self' ? selfPick.value : partnerPick.value))
const myName = computed(() => nameOf(identity.value))
const partnerName = computed(() => nameOf(otherIdentity.value))

const phaseLabel = computed(() => {
  if (theme.value === 'male') return phase.value === 'self' ? '我来选' : 'TA 来选'
  return phase.value === 'self' ? `${myName.value} 选择` : `${partnerName.value} 选择`
})
const confirmText = computed(() => {
  if (theme.value === 'male') return phase.value === 'self' ? '锁定答案' : '揭晓默契'
  return phase.value === 'self' ? '换 TA 来选' : '揭晓默契'
})
const resultTitle = computed(() => {
  if (theme.value === 'male') return lastMatch.value ? '心有灵犀' : '差一点点'
  return lastMatch.value ? '心有灵犀' : '差一点点'
})
const resultNote = computed(() => {
  if (lastMatch.value) return streak.value >= 2 ? `连中 ${streak.value} 轮，默契正在升温。` : '这一题你们选到了一起。'
  return '答案不一样也没关系，下一题继续校准。'
})
const finalTitle = computed(() => {
  if (score.value >= 80) return theme.value === 'male' ? '你们今天超同步' : '你们今天超同步'
  if (score.value >= 50) return theme.value === 'male' ? '默契正在发光' : '默契正在发光'
  return theme.value === 'male' ? '多聊两句会更甜' : '多聊两句会更甜'
})
const nextButtonText = computed(() => (theme.value === 'male' ? '下一题' : '下一题'))
const finalButtonText = computed(() => (theme.value === 'male' ? '查看总分' : '查看总分'))

function selectAnswer(key) {
  if (showResult.value) return
  if (phase.value === 'self') selfPick.value = key
  else partnerPick.value = key
}

function nextPhase() {
  if (!currentPick.value) return
  if (phase.value === 'self') {
    phase.value = 'partner'
    partnerPick.value = ''
    return
  }
  evaluateRound()
}

function evaluateRound() {
  lastMatch.value = selfPick.value === partnerPick.value
  if (lastMatch.value) {
    streak.value += 1
    score.value = Math.min(100, score.value + 20)
    vibrate(15)
  } else {
    streak.value = 0
  }
  history.value.unshift({
    title: currentQuestion.value.title,
    match: lastMatch.value,
  })
  if (score.value > bestScore.value) {
    bestScore.value = score.value
    localStorage.setItem('quiz_best_score', String(bestScore.value))
  }
  showResult.value = true
}

function nextRound() {
  showResult.value = false
  if (roundIndex.value + 1 >= questions.length) {
    completed.value = true
    return
  }
  roundIndex.value += 1
  phase.value = 'self'
  selfPick.value = ''
  partnerPick.value = ''
}

function resetGame() {
  phase.value = 'self'
  selfPick.value = ''
  partnerPick.value = ''
  roundIndex.value = 0
  score.value = 0
  streak.value = 0
  showResult.value = false
  lastMatch.value = false
  completed.value = false
  history.value = []
}

function getOptionLabel(key) {
  const option = currentQuestion.value.options.find((item) => item.key === key)
  return option ? `${option.emoji} ${option.label}` : ''
}

function goBack() {
  emit('close')
}

onMounted(() => {
  bestScore.value = Number(localStorage.getItem('quiz_best_score') || 0)
})
</script>

<template>
  <div class="quiz-page scroll-area" :class="themeClass">
    <div class="nav-bar">
      <span class="back-btn" @click="goBack">返回</span>
      <span class="nav-title">默契挑战</span>
      <span class="reset-btn" @click="resetGame">重开</span>
    </div>

    <div class="score-panel">
      <div class="pair">
        <img class="avatar" src="/static/photo8.jpg" alt="" />
        <div class="link-line"></div>
        <img class="avatar" src="/static/photo1.jpg" alt="" />
      </div>
      <div class="score-block">
        <span class="score-label">当前默契值</span>
        <span class="score-value">{{ score }}</span>
        <span class="score-sub">最高默契 {{ bestScore }}</span>
      </div>
      <div class="meter">
        <div class="meter-fill" :style="{ width: score + '%' }"></div>
      </div>
    </div>

    <div v-if="!completed" class="round-card">
      <div class="round-top">
        <span class="round-index">第 {{ roundIndex + 1 }} / {{ questions.length }} 题</span>
        <span class="phase-pill">{{ phaseLabel }}</span>
      </div>

      <span class="question">{{ currentQuestion.title }}</span>

      <div class="answer-grid">
        <div
          v-for="option in currentQuestion.options"
          :key="option.key"
          class="answer-card"
          :class="{ selected: currentPick === option.key }"
          @click="selectAnswer(option.key)"
        >
          <span class="answer-emoji">{{ option.emoji }}</span>
          <span class="answer-label">{{ option.label }}</span>
        </div>
      </div>

      <button class="primary-btn" :disabled="!currentPick" @click="nextPhase">{{ confirmText }}</button>
    </div>

    <div v-if="showResult && !completed" class="result-card">
      <span class="result-kicker">{{ lastMatch ? '+20' : '+0' }}</span>
      <span class="result-title">{{ resultTitle }}</span>
      <span class="result-note">{{ resultNote }}</span>
      <div class="choice-row">
        <div class="choice-pill">{{ myName }}：{{ getOptionLabel(selfPick) }}</div>
        <div class="choice-pill">{{ partnerName }}：{{ getOptionLabel(partnerPick) }}</div>
      </div>
      <button class="secondary-btn" @click="nextRound">
        {{ roundIndex + 1 >= questions.length ? finalButtonText : nextButtonText }}
      </button>
    </div>

    <div v-if="completed" class="final-card">
      <span class="final-kicker">挑战完成</span>
      <span class="final-score">{{ score }}</span>
      <span class="final-title">{{ finalTitle }}</span>
      <button class="primary-btn" @click="resetGame">再玩一次</button>
    </div>

    <div v-if="history.length" class="history">
      <span class="history-title">本局记录</span>
      <div v-for="(item, index) in history" :key="index" class="history-row">
        <span class="history-state">{{ item.match ? '✓' : '×' }}</span>
        <span class="history-text">{{ item.title }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-page {
  position: fixed;
  inset: 0;
  z-index: 100;
  padding: 0 16px 28px;
  box-sizing: border-box;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.theme-female {
  background: linear-gradient(180deg, #fffdf5 0%, #ffeef4 52%, #edf8ff 100%);
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
.quiz-page > * { position: relative; z-index: 1; }

.nav-bar {
  height: 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.back-btn, .reset-btn { width: 58px; font-size: 13px; font-weight: 700; cursor: pointer; }
.reset-btn { text-align: right; }
.nav-title { font-size: 18px; font-weight: 900; }
.theme-female .back-btn, .theme-female .reset-btn { color: #9b5d78; }
.theme-male .back-btn, .theme-male .reset-btn { color: var(--ios-accent); }

.score-panel { margin-top: 14px; padding: 18px; border-radius: 24px; }
.theme-female .score-panel { background: rgba(255, 255, 255, 0.82); box-shadow: 0 14px 30px rgba(129, 100, 160, 0.12); }
.theme-male .score-panel { background: var(--ios-surface); border-radius: 16px; }
.pair { display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
.avatar { width: 58px; height: 58px; border-radius: 20px; border: 2px solid rgba(255, 255, 255, 0.9); box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12); object-fit: cover; }
.theme-male .avatar { border-radius: 16px; border-color: var(--ios-surface-3); }
.link-line { width: 82px; height: 3px; margin: 0 10px; border-radius: 999px; }
.theme-female .link-line { background: linear-gradient(90deg, #ffb7c5, #8fd3f4); }
.theme-male .link-line { background: var(--ios-accent); border-radius: 999px; }
.score-block { text-align: center; }
.score-label { display: block; font-size: 11px; letter-spacing: 2px; opacity: 0.7; }
.score-value { display: block; font-size: 46px; font-weight: 900; line-height: 1; margin-top: 8px; }
.score-sub { display: block; font-size: 12px; opacity: 0.72; margin-top: 6px; }
.meter { height: 8px; border-radius: 999px; margin-top: 16px; overflow: hidden; }
.theme-female .meter { background: rgba(255, 183, 197, 0.22); }
.theme-male .meter { background: var(--ios-fill); border-radius: 999px; }
.meter-fill { height: 100%; transition: width 0.28s ease; }
.theme-female .meter-fill { background: linear-gradient(90deg, #ffb7c5, #8fd3f4); }
.theme-male .meter-fill { background: var(--ios-accent); }

.round-card, .result-card, .final-card, .history { margin-top: 14px; padding: 18px; border-radius: 24px; }
.theme-female .round-card, .theme-female .result-card, .theme-female .final-card, .theme-female .history {
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 12px 26px rgba(129, 100, 160, 0.08);
}
.theme-male .round-card, .theme-male .result-card, .theme-male .final-card, .theme-male .history {
  background: var(--ios-surface);
  border-radius: 16px;
}
.round-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.round-index { font-size: 12px; opacity: 0.7; font-weight: 700; }
.phase-pill { padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; }
.theme-female .phase-pill { background: rgba(255, 183, 197, 0.24); color: #8a4d68; }
.theme-male .phase-pill { background: rgba(10, 132, 255, 0.16); color: var(--ios-accent); border-radius: 999px; }
.question { display: block; min-height: 56px; font-size: 22px; line-height: 1.35; font-weight: 900; margin-bottom: 16px; }
.answer-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.answer-card {
  min-height: 88px;
  padding: 12px 8px;
  box-sizing: border-box;
  text-align: center;
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.15s;
}
.theme-female .answer-card { background: #fff7fb; border-radius: 18px; color: #4b3046; }
.theme-male .answer-card { background: var(--ios-surface-2); border-radius: 12px; color: var(--ios-text); border-color: transparent; }
.theme-female .answer-card.selected { border-color: #ff8ab2; background: #fff0f5; box-shadow: 0 8px 18px rgba(255, 138, 178, 0.16); }
.theme-male .answer-card.selected { border-color: var(--ios-accent); background: rgba(10, 132, 255, 0.2); }
.answer-card:active { transform: scale(0.97); }
.answer-emoji { display: block; font-size: 30px; margin-bottom: 8px; }
.answer-label { display: block; font-size: 14px; font-weight: 800; }

.primary-btn, .secondary-btn {
  margin-top: 16px;
  height: 44px;
  line-height: 44px;
  border: none;
  font-size: 15px;
  font-weight: 900;
  width: 100%;
  cursor: pointer;
  font-family: inherit;
}
.theme-female .primary-btn, .theme-female .secondary-btn { border-radius: 999px; color: #5a3947; background: linear-gradient(135deg, #ffb7c5, #8fd3f4); }
.theme-male .primary-btn, .theme-male .secondary-btn { border-radius: 999px; color: #ffffff; background: var(--ios-accent); }
.primary-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.result-kicker, .final-kicker { display: block; font-size: 12px; letter-spacing: 2px; opacity: 0.7; font-weight: 800; }
.result-title { display: block; font-size: 26px; font-weight: 900; margin: 8px 0; }
.result-note { display: block; font-size: 13px; line-height: 1.7; opacity: 0.78; }
.choice-row { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.choice-pill { padding: 10px 12px; border-radius: 12px; font-size: 13px; font-weight: 700; }
.theme-female .choice-pill { background: rgba(255, 183, 197, 0.16); color: #6d4b5c; }
.theme-male .choice-pill { background: var(--ios-fill); color: var(--ios-text); border-radius: 12px; }
.final-card { text-align: center; }
.final-score { display: block; font-size: 60px; font-weight: 900; line-height: 1; margin: 10px 0; }
.final-title { display: block; font-size: 18px; font-weight: 900; margin-bottom: 6px; }
.history-title { display: block; font-size: 13px; font-weight: 900; margin-bottom: 10px; }
.history-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(0, 0, 0, 0.06); }
.history-row:last-child { border-bottom: none; }
.theme-male .history-row { border-bottom: 0.5px solid var(--ios-separator); }
.history-state { width: 22px; height: 22px; line-height: 22px; text-align: center; font-size: 13px; font-weight: 900; flex-shrink: 0; }
.theme-female .history-state { border-radius: 50%; background: rgba(255, 183, 197, 0.2); color: #b65a78; }
.theme-male .history-state { border-radius: 50%; background: rgba(10, 132, 255, 0.16); color: var(--ios-accent); }
.history-text { flex: 1; min-width: 0; font-size: 13px; line-height: 1.5; opacity: 0.78; }
</style>
