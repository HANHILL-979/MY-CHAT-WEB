<script setup>
import { ref, computed, onMounted } from 'vue'
import { showToast, showImagePreview } from 'vant'
import { supabase } from '../supabase'
import { identity } from '../identity'
import { theme } from '../theme'
import { getTimestamp, formatDateTime } from '../utils/time'
import { pickImages, compressImage } from '../utils/image'

const emit = defineEmits(['close'])

const doneCount = ref(0)
const showUploadModal = ref(false)
const showViewModal = ref(false)
const tempImg = ref('')
const tableMissing = ref(false)
const currentTask = ref({ index: 0, title: '', done: false, image: '', doneTime: '' })

const themeClass = computed(() => (theme.value === 'male' ? 'theme-male' : 'theme-female'))

// 💌 恋爱清单 100 件小事（完整复刻 Linda1 staticTasks）
const staticTasks = [
  '一起过生日🎂', '一起去旅行🧳', '一起过情人节🍫', '一起吃海底捞🍲', '一起吊娃娃🧸',
  '一起去海边🐳', '一起回老家🚌', '一起看电影🎬', '一起大扫除🧹', '一起穿情侣装👔',
  '一起吃火锅🥣', '一起吃烤肉🥩', '一起吃烤鱼🐟', '一起吃宵夜🥔', '一起打羽毛球🏸',
  '一起逛菜市场🥬', '一起做饭🍳', '一起跑步🏃', '一起搬家🏠', '一起去游乐园🎠',
  '一起制作专属相册', '一起用情侣手机壳📱', '一起用勺子吃西瓜🍉', '一起发朋友圈合照', '一起海边看日落🌇',
  '一起拍日常vlog📹', '一起庆祝纪念日💰', '一起晚饭后散步', '一起跟朋友吃饭🍻', '一起换情侣头像',
  '一起玩五子棋🖐', '一起骑电动车🛵', '一起去小吃街', '一起自驾游', '一起打电动',
  '一起玩游戏🎮', '一起看球赛', '一起剪头发💇‍♂️', '一起刮彩票🎟️', '一起逛超市',
  '一起买家具🪑', '一起打扑克♠️', '一起跨年🧨', '一起健身💪', '一起划船🚣‍♀️',
  '一起赏花🌸', '一起熬夜🥱', '一起种植物🌳', '介绍给彼此的朋友👬', '给对方准备礼物🎁',
  '难过时的陪伴😢', '给我吹头发💇', '给我穿鞋👟', '照顾对方🤒', '陪我做美甲💅',
  '接我下班🚃', '拥有车子🚗', '给我送花🌹', '吵架（并和好）💨', '一起参加别人的婚礼💒',
  '一起去听一场演唱会🎶', '一起去农场摘水果🥭', '一起逛盒马生鲜🏪', '一起逛花鸟市场🐋', '一起拍情侣写真💑',
  '一起去南山祈福🏮', '一起去水上乐园🔫', '一起海边看日出🌅', '一起坐绿皮火车🚞', '一起去天涯海角🏝️',
  '一起去迪士尼🏰', '一起放孔明灯🙏', '一起户外烧烤🍖', '一起郊游踏青🌴', '一起坐直升机🚁',
  '一起去植物园🌳', '一起去动物园🐒', '一起坐飞机✈️', '一起住民宿🏨', '一起去体检🏥',
  '一起看烟花🎆', '一起打雪仗❄️', '一起敷面膜🥰', '一起坐缆车🚠', '一起去K歌🎤',
  '一起钓鱼🎣', '一起潜水🤿', '一起冲浪🏄‍♀️', '一起露营⛺️', '一起爬山🧗‍♀️',
  '一起漂流🏞️', '一起喝酒🍻', '一起泡脚🦶', '一起见对方父母🧓', '一起出国旅游✈️',
  '一起领结婚证🎎', '一起买房子🏠', '一起结婚👰', '一起生娃👶', '一起白头偕老👴👵',
]

const fullList = ref([])

function initList() {
  fullList.value = staticTasks.map((title) => ({
    title,
    done: false,
    image: '',
    doneTime: '',
  }))
}

// 从云端拉取"哪些做完了"（task_id 索引匹配 + title 兜底兼容旧数据）
async function fetchStatus() {
  try {
    const { data, error } = await supabase.from('couple_tasks').select('*').limit(500)
    if (error) throw error
    const records = Array.isArray(data) ? data : []
    tableMissing.value = false

    records.forEach((rec) => {
      let taskId = rec.task_id
      if (taskId === undefined || taskId === null) {
        taskId = rec.taskId !== undefined ? rec.taskId : rec.taskID
      }
      if (taskId === undefined || taskId === null || taskId === '') return
      const index = parseInt(taskId, 10)
      if (!isFinite(index) || index < 0 || index >= fullList.value.length) return
      fullList.value[index].done = true
      fullList.value[index].image = rec.image_url
      fullList.value[index].doneTime = formatDateTime(getTimestamp(rec.create_time))
    })

    // 兼容按文字 title 匹配的老数据
    records.forEach((rec) => {
      if (!rec || !rec.title) return
      const hitIndex = staticTasks.indexOf(rec.title)
      if (hitIndex === -1) return
      if (fullList.value[hitIndex].done) return
      fullList.value[hitIndex].done = true
      fullList.value[hitIndex].image = rec.image_url
      fullList.value[hitIndex].doneTime = formatDateTime(getTimestamp(rec.create_time))
    })

    doneCount.value = fullList.value.filter((item) => item.done).length
  } catch (e) {
    console.error('获取恋爱清单失败', e)
    tableMissing.value = true
  }
}

function handleTaskClick(item, index) {
  currentTask.value = { ...item, index }
  if (item.done) {
    showViewModal.value = true
  } else {
    tempImg.value = ''
    showUploadModal.value = true
  }
}

async function chooseImage() {
  const files = await pickImages(1)
  if (!files.length) return
  try {
    tempImg.value = await compressImage(files[0], 960, 0.72)
  } catch (e) {
    showToast('图片处理失败')
  }
}

async function submitTask() {
  if (!tempImg.value) {
    showToast('请先上传照片证明哦~')
    return
  }
  showToast({ message: '打卡中...', duration: 0, forbidClick: true })
  try {
    const { error } = await supabase.from('couple_tasks').insert([
      {
        task_id: currentTask.value.index,
        title: currentTask.value.title,
        image_url: tempImg.value,
        create_time: Date.now(),
        writer: identity.value,
      },
    ])
    if (error) throw error
    showToast.clear && showToast.clear()
    showToast('打卡成功！❤️')
    closeModal()
    fetchStatus()
  } catch (e) {
    showToast.clear && showToast.clear()
    console.error('打卡失败', e)
    showToast('打卡失败：请先在 Supabase 执行 supabase-setup.sql 创建 couple_tasks 表')
  }
}

function closeModal() {
  showUploadModal.value = false
  showViewModal.value = false
}

function previewImg(url) {
  showImagePreview({ images: [url], closeable: true })
}

function goBack() {
  emit('close')
}

onMounted(() => {
  initList()
  fetchStatus()
})
</script>

<template>
  <div class="record-page scroll-area" :class="themeClass">
    <!-- 女性视角 -->
    <template v-if="theme !== 'male'">
      <div class="header-card">
        <div class="progress-info">
          <span class="p-title">我们一起完成的小事</span>
          <span class="p-num"><span class="highlight">{{ doneCount }}</span> / 100</span>
        </div>
        <div class="progress-bar">
          <div class="progress-inner" :style="{ width: doneCount + '%' }"></div>
        </div>
        <span class="sub-text">余生漫长，请多指教 💕</span>
      </div>

      <div class="task-grid">
        <div
          v-for="(item, index) in fullList"
          :key="index"
          class="task-item"
          :class="{ 'is-done': item.done }"
          @click="handleTaskClick(item, index)"
        >
          <span class="task-no">{{ index + 1 }}</span>
          <span class="task-content">{{ item.title }}</span>
          <div v-if="item.done" class="done-stamp"><span class="stamp-text">❤️</span></div>
          <div v-else class="todo-icon">🤍</div>
        </div>
      </div>
    </template>

    <!-- 男性视角 -->
    <template v-else>
      <div class="male-header">
        <div class="male-title-group">
          <span class="male-eyebrow">LOVE::TASKS</span>
          <span class="male-title">CHECKLIST STREAM</span>
        </div>
        <div class="male-count">
          <span class="male-count-num">{{ doneCount }}</span>
          <span class="male-count-total">/100</span>
        </div>
        <div class="male-progress">
          <div class="male-progress-bar">
            <div class="male-progress-inner" :style="{ width: doneCount + '%' }"></div>
          </div>
          <span class="male-progress-note">SYNC {{ doneCount }} DONE</span>
        </div>
      </div>

      <div class="male-list">
        <div
          v-for="(item, index) in fullList"
          :key="index"
          class="male-row"
          :class="{ done: item.done }"
          @click="handleTaskClick(item, index)"
        >
          <span class="row-index">{{ String(index + 1).padStart(2, '0') }}</span>
          <div class="row-body">
            <span class="row-title">{{ item.title }}</span>
            <span class="row-status">{{ item.done ? 'DONE' : 'TODO' }}</span>
          </div>
          <span class="row-flag">{{ item.done ? '✓' : '…' }}</span>
        </div>
      </div>
    </template>

    <!-- 返回按钮 -->
    <div class="back-bar">
      <span class="back-btn" @click="goBack">{{ theme === 'male' ? '◄ BACK' : '❮ 返回' }}</span>
    </div>

    <!-- 数据库未就绪提示 -->
    <div v-if="tableMissing" class="missing-tip">
      ⚠️ 打卡数据未就绪：请在 Supabase 控制台执行项目根目录的 supabase-setup.sql 创建 couple_tasks 表
    </div>

    <!-- 打卡上传弹窗 -->
    <div v-if="showUploadModal" class="modal-mask" @click="closeModal">
      <div class="modal-box" @click.stop>
        <div class="modal-header">
          <span class="m-title">打卡第 {{ currentTask.index + 1 }} 件小事</span>
          <span class="m-sub">{{ currentTask.title }}</span>
        </div>

        <div class="upload-area" @click="chooseImage">
          <img v-if="tempImg" :src="tempImg" class="preview-img" alt="" />
          <div v-else class="placeholder">
            <span class="plus">+</span>
            <span class="tip">上传一张甜蜜合照</span>
          </div>
        </div>

        <button class="confirm-btn" @click="submitTask">确认完成 ✅</button>
      </div>
    </div>

    <!-- 查看已完成弹窗 -->
    <div v-if="showViewModal" class="modal-mask" @click="closeModal">
      <div class="modal-box view-box" @click.stop>
        <div class="modal-header">
          <span class="m-title">第 {{ currentTask.index + 1 }} 件小事达成！</span>
          <span class="m-date">📅 {{ currentTask.doneTime }}</span>
        </div>

        <img
          v-if="currentTask.image"
          :src="currentTask.image"
          class="memory-img"
          alt=""
          @click="previewImg(currentTask.image)"
        />

        <div class="footer-msg"><span>✨ 和你在一起的每一刻都值得记录</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.record-page {
  position: fixed;
  inset: 0;
  z-index: 100;
  padding: 14px 15px 50px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.theme-female { background: linear-gradient(180deg, #fffdf5 0%, #ffeef3 100%); }
.theme-male { background: linear-gradient(180deg, #121212 0%, #0d1118 100%); }
.theme-male::before {
  content: "";
  position: fixed;
  inset: 0;
  background:
    repeating-linear-gradient(90deg, rgba(0, 229, 255, 0.08) 0, rgba(0, 229, 255, 0.08) 1px, transparent 1px, transparent 30px),
    repeating-linear-gradient(0deg, rgba(0, 229, 255, 0.05) 0, rgba(0, 229, 255, 0.05) 1px, transparent 1px, transparent 30px);
  opacity: 0.16;
  pointer-events: none;
}

.back-bar { margin-bottom: 10px; }
.back-btn { font-size: 15px; color: #ff6b81; font-weight: 500; cursor: pointer; }
.theme-male .back-btn { color: #00e5ff; font-size: 12px; letter-spacing: 1px; }

/* 女性视角头部 */
.header-card {
  background: rgba(255, 255, 255, 0.9);
  padding: 20px;
  border-radius: 24px;
  box-shadow: 0 8px 20px rgba(255, 183, 197, 0.2);
  margin-bottom: 20px;
}
.progress-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.p-title { font-size: 18px; font-weight: bold; color: #4b3046; }
.p-num { font-size: 16px; color: #8a7da6; }
.highlight { color: #ff8ab2; font-size: 24px; font-weight: bold; }
.progress-bar { height: 10px; background: rgba(255, 183, 197, 0.2); border-radius: 999px; overflow: hidden; margin-bottom: 10px; }
.progress-inner { height: 100%; background: linear-gradient(90deg, #ffb7c5, #ffd93d); transition: width 0.5s ease; }
.sub-text { font-size: 12px; color: #9a86a8; display: block; text-align: right; }

.task-grid { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }
.task-item {
  width: 31%;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 16px;
  padding: 15px 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  position: relative;
  box-shadow: 0 6px 12px rgba(129, 100, 160, 0.08);
  transition: all 0.2s;
  cursor: pointer;
}
.task-item:active { transform: scale(0.98); }
.task-item.is-done { background: #fff0f3; border: 1px solid #ffdae0; }
.task-no { font-size: 20px; font-weight: 900; color: #f0e8f2; position: absolute; top: 5px; left: 8px; line-height: 1; }
.is-done .task-no { color: #ffd1d8; }
.task-content {
  font-size: 12px;
  color: #4b3046;
  text-align: center;
  margin-top: 10px;
  line-height: 1.4;
  z-index: 2;
  font-weight: bold;
  padding: 0 4px;
}
.todo-icon { margin-top: 10px; font-size: 16px; opacity: 0.5; }
.done-stamp { position: absolute; bottom: 5px; right: 5px; opacity: 0.8; }
.stamp-text { font-size: 18px; }

/* 男性视角 */
.male-header {
  background: rgba(10, 12, 18, 0.92);
  border: 1px solid rgba(0, 229, 255, 0.2);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 16px 30px rgba(0, 0, 0, 0.4);
}
.male-title-group { display: flex; flex-direction: column; gap: 6px; }
.male-eyebrow { font-size: 10px; letter-spacing: 2px; color: rgba(0, 229, 255, 0.7); }
.male-title { font-size: 18px; font-weight: 700; color: #e8faff; }
.male-count { margin-top: 8px; display: flex; align-items: baseline; gap: 4px; }
.male-count-num { font-size: 26px; font-weight: 700; color: #00e5ff; }
.male-count-total { font-size: 12px; color: rgba(159, 200, 212, 0.8); }
.male-progress { margin-top: 12px; }
.male-progress-bar { height: 6px; background: rgba(0, 229, 255, 0.12); border-radius: 999px; overflow: hidden; }
.male-progress-inner { height: 100%; background: linear-gradient(90deg, #00e5ff, #6a7dff); }
.male-progress-note { display: block; margin-top: 8px; font-size: 10px; letter-spacing: 1px; color: rgba(0, 229, 255, 0.7); }

.male-list { display: flex; flex-direction: column; gap: 10px; }
.male-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(9, 12, 18, 0.92);
  border: 1px solid rgba(0, 229, 255, 0.18);
  border-radius: 8px;
  cursor: pointer;
}
.male-row.done { border-color: rgba(0, 229, 255, 0.5); box-shadow: 0 0 0 1px rgba(0, 229, 255, 0.12); }
.row-index { font-size: 12px; color: rgba(0, 229, 255, 0.7); letter-spacing: 1px; }
.row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.row-title { font-size: 13px; color: #e8faff; }
.row-status { font-size: 10px; color: rgba(159, 200, 212, 0.7); letter-spacing: 1px; }
.row-flag { font-size: 14px; color: #00e5ff; }

/* 弹窗 */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  backdrop-filter: blur(3px);
}
.modal-box {
  width: 80%;
  background: #fff;
  border-radius: 24px;
  padding: 25px;
  animation: popup 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}
@keyframes popup {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.modal-header { text-align: center; margin-bottom: 20px; }
.m-title { display: block; font-size: 18px; font-weight: bold; color: #333; margin-bottom: 5px; }
.m-sub { font-size: 14px; color: #888; }
.m-date { font-size: 14px; color: #ff6b81; margin-top: 5px; display: block; }

.upload-area {
  width: 100%;
  height: 200px;
  background: #f5f5f5;
  border-radius: 12px;
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  border: 2px dashed #ddd;
  cursor: pointer;
}
.placeholder { display: flex; flex-direction: column; align-items: center; color: #ccc; }
.plus { font-size: 40px; font-weight: bold; }
.tip { font-size: 12px; margin-top: 5px; }
.preview-img { width: 100%; height: 100%; object-fit: cover; }

.confirm-btn {
  width: 100%;
  background: linear-gradient(135deg, #ffb7c5, #ffd93d);
  color: #5a3947;
  border-radius: 50px;
  font-weight: bold;
  box-shadow: 0 6px 18px rgba(255, 183, 197, 0.35);
  border: none;
  height: 42px;
  font-size: 15px;
  cursor: pointer;
  font-family: inherit;
}

.memory-img { width: 100%; height: 250px; border-radius: 12px; margin-bottom: 15px; box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1); object-fit: cover; cursor: pointer; }
.footer-msg { text-align: center; color: #aaa; font-size: 12px; }

.theme-male .modal-box { background: rgba(10, 12, 18, 0.96); border-radius: 10px; border: 1px solid rgba(0, 229, 255, 0.22); box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45); }
.theme-male .m-title { color: #e8faff; }
.theme-male .m-sub { color: rgba(159, 200, 212, 0.75); }
.theme-male .m-date { color: #00e5ff; }
.theme-male .confirm-btn { background: linear-gradient(135deg, #00e5ff, #6a7dff); color: #041018; box-shadow: 0 8px 18px rgba(0, 229, 255, 0.3); }
.theme-male .upload-area { background: rgba(0, 229, 255, 0.05); border: 1px dashed rgba(0, 229, 255, 0.3); }
.theme-male .placeholder { color: rgba(0, 229, 255, 0.5); }
.theme-male .memory-img { border-radius: 6px; }
.theme-male .footer-msg { color: rgba(159, 200, 212, 0.7); }

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
.theme-male .missing-tip { background: rgba(255, 180, 84, 0.1); color: #ffca7a; }
</style>
