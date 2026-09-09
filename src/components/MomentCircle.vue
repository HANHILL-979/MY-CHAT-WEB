<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { showToast, showDialog, showImagePreview } from 'vant'
import { supabase } from '../supabase'
import { identity, identityProfiles, displayName, nameOf } from '../identity'
import { theme } from '../theme'
import { getTimestamp, formatMomentTime } from '../utils/time'
import { pickAndCompress } from '../utils/image'

const props = defineProps({
  active: { type: Boolean, default: true },
})

const cloudList = ref([])
const showPublishModal = ref(false)
const newContent = ref('')
const tempImages = ref([])
const activeMenuId = ref(null)
const pollTimer = ref(null)
const isPosting = ref(false)
const tableMissing = ref(false)
const likeDebounce = {}
// 评论弹窗状态
const showCommentModal = ref(false)
const commentTarget = ref(null)
const commentText = ref('')

const themeClass = computed(() => (theme.value === 'male' ? 'theme-male' : 'theme-female'))
const myName = computed(() => displayName.value)
const myAvatar = computed(() => identityProfiles[identity.value].img)

// 内置示例动态（复刻 Linda1 staticList，头像/示例图随静态资源）
const staticList = [
  {
    userName: '小椰宝',
    userAvatar: '/static/photo1.jpg',
    content: '这是第一条朋友圈，小椰宝和大椰树在一起啦！',
    image: '/static/photo5.jpg',
    create_time: new Date('2025/11/25 10:00:00').getTime(),
  },
  {
    userName: '小椰宝',
    userAvatar: '/static/photo1.jpg',
    content: 'hello 大家好，这是我们',
    image: '/static/photo3.jpg',
    create_time: new Date('2025/11/25 10:05:00').getTime(),
  },
  {
    userName: '大椰树',
    userAvatar: '/static/photo8.jpg',
    content: '今天也是超级开心的一天 ✨',
    image: '/static/photo2.jpg',
    create_time: new Date('2025/11/25 11:00:00').getTime(),
  },
  {
    userName: '大椰树',
    userAvatar: '/static/photo8.jpg',
    content: '我们要一直一直走下去 ❤️',
    image: '/static/photo4.jpg',
    create_time: new Date('2025/11/25 12:00:00').getTime(),
  },
]

const displayList = computed(() => {
  const allItems = [...cloudList.value, ...staticList.map((item) => normalizeMoment(item))]
  return allItems.sort((a, b) => b.create_time - a.create_time)
})

// ---- 数据归一化（复刻 Linda1 normalizeMoment） ----
function normalizeMoment(item = {}) {
  let safeTs = Date.now()
  const rawTs = item.create_time || item.created_at
  if (rawTs) {
    const num = Number(rawTs)
    if (!Number.isNaN(num)) {
      safeTs = num < 1e12 ? num * 1000 : num
    } else {
      const parsed = Date.parse(String(rawTs).replace(/-/g, '/'))
      if (!Number.isNaN(parsed)) safeTs = parsed
    }
  }
  const sender = item.sender || (item.userName === '小椰宝' ? 'user_b' : item.userName === '大椰树' ? 'user_a' : undefined)
  return {
    ...item,
    _id: item._id || item.id,
    sender,
    userName: item.userName || item.nickname || nameOf(item.sender),
    userAvatar: item.userAvatar || item.avatar || (item.sender ? identityProfiles[item.sender]?.img : undefined),
    likes: Array.isArray(item.likes) ? item.likes : [],
    comments: Array.isArray(item.comments) ? item.comments : [],
    images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
    create_time: safeTs,
    time: formatMomentTime(safeTs),
  }
}

// ---- 本地缓存 ----
function saveToLocal() {
  try {
    localStorage.setItem('moments_cache', JSON.stringify(cloudList.value.slice(0, 50)))
  } catch (e) {
    console.warn('save cache failed', e)
  }
}
function loadFromLocal() {
  try {
    const local = JSON.parse(localStorage.getItem('moments_cache') || '[]')
    if (Array.isArray(local) && local.length > 0) {
      cloudList.value = local.map(normalizeMoment).sort((a, b) => b.create_time - a.create_time)
    }
  } catch (e) {
    /* 忽略损坏缓存 */
  }
}

// ---- 云端拉取（60 秒轮询 + Map 去重合并） ----
async function getCloudMoments() {
  try {
    const { data, error } = await supabase
      .from('moments')
      .select('*')
      .order('create_time', { ascending: false })
      .limit(20)
    if (error) {
      // 表未创建：标记提示，不崩页面
      if (error.code === '42P01' || error.message?.includes('42P01') || error.details?.includes('missing')) {
        tableMissing.value = true
      }
      return
    }
    tableMissing.value = false
    const newFetchedList = data || []
    const merged = new Map()
    ;[...cloudList.value, ...newFetchedList].forEach((item) => {
      const key = item._id || item.id || `${item.sender || ''}_${item.create_time || ''}`
      merged.set(key, normalizeMoment(item))
    })
    cloudList.value = Array.from(merged.values()).sort((a, b) => b.create_time - a.create_time)
    saveToLocal()
  } catch (e) {
    console.error('getCloudMoments error', e)
  }
}

function startPolling() {
  stopPolling()
  pollTimer.value = setInterval(() => {
    if (props.active) getCloudMoments()
  }, 60000)
}
function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}

// ---- 交互菜单 ----
function toggleMenu(id) {
  activeMenuId.value = activeMenuId.value === id ? null : id
}
function closeMenu() {
  activeMenuId.value = null
}
function isLiked(likes) {
  if (!likes) return false
  return likes.includes(myName.value)
}
function findCloudItem(id) {
  if (!id) return { item: null, index: -1 }
  const index = cloudList.value.findIndex((i) => i._id === id)
  return { item: index > -1 ? cloudList.value[index] : null, index }
}

// ---- 点赞（500ms 防抖 + 乐观更新 + 失败回滚） ----
async function toggleLike(item) {
  if (!item || !item._id) return
  const key = `like_${item._id}`
  if (likeDebounce[key]) return
  likeDebounce[key] = true
  setTimeout(() => {
    likeDebounce[key] = false
  }, 500)

  const { item: target, index } = findCloudItem(item._id)
  if (!target) {
    likeDebounce[key] = false
    return
  }
  const prevLikes = Array.isArray(target.likes) ? target.likes.slice() : []
  const name = myName.value

  try {
    if (!Array.isArray(target.likes)) target.likes = []
    const liked = target.likes.includes(name)
    if (liked) {
      const idx = target.likes.indexOf(name)
      if (idx > -1) target.likes.splice(idx, 1)
    } else {
      target.likes.push(name)
    }
    activeMenuId.value = null
    if (index > -1) cloudList.value.splice(index, 1, normalizeMoment(target))
    saveToLocal()

    const { error } = await supabase.from('moments').update({ likes: target.likes }).eq('id', item._id)
    if (error) throw error
  } catch (e) {
    if (index > -1) {
      target.likes = prevLikes
      cloudList.value.splice(index, 1, normalizeMoment(target))
      saveToLocal()
    }
    showToast('点赞失败')
  } finally {
    likeDebounce[key] = false
  }
}

// ---- 评论 ----
function showCommentInput(item) {
  if (!item || !item._id) return
  activeMenuId.value = null
  commentTarget.value = item
  commentText.value = ''
  showCommentModal.value = true
}

async function submitComment() {
  const content = commentText.value.trim()
  if (!content || !commentTarget.value) return
  showToast({ message: '提交中', duration: 0, forbidClick: true })
  const { item: target, index } = findCloudItem(commentTarget.value._id)
  if (!target) {
    showToast.clear && showToast.clear()
    return
  }
  const newComment = { nickname: myName.value, content }
  if (!target.comments) target.comments = []
  target.comments.push(newComment)
  if (index > -1) cloudList.value.splice(index, 1, normalizeMoment(target))
  saveToLocal()

  try {
    const { error } = await supabase.from('moments').update({ comments: target.comments }).eq('id', target._id)
    if (error) throw error
    showToast.clear && showToast.clear()
    showCommentModal.value = false
    commentText.value = ''
  } catch (e) {
    showToast.clear && showToast.clear()
    if (index > -1) {
      target.comments.pop()
      cloudList.value.splice(index, 1, normalizeMoment(target))
      saveToLocal()
    }
    showToast('评论失败')
  }
}

// 长按评论 → 删除
let commentPressTimer = null
function onCommentPressStart(item, comment) {
  commentPressTimer = setTimeout(() => onLongPressComment(item, comment), 500)
}
function onCommentPressEnd() {
  clearTimeout(commentPressTimer)
}
function onLongPressComment(item, commentToDelete) {
  const { item: target, index } = findCloudItem(item._id)
  if (!target) return
  showDialog({
    title: '提示',
    message: '确认删除这条评论？',
    showCancelButton: true,
  }).then(async () => {
    const newComments = (target.comments || []).filter((c) => c !== commentToDelete)
    target.comments = newComments
    if (index > -1) cloudList.value.splice(index, 1, normalizeMoment(target))
    saveToLocal()
    try {
      await supabase.from('moments').update({ comments: newComments }).eq('id', item._id)
      showToast('已删除')
    } catch (e) {
      /* 静默 */
    }
  }).catch(() => {})
}

// ---- 发布动态 ----
async function chooseImages() {
  const rest = 9 - tempImages.value.length
  if (rest <= 0) return
  const urls = await pickAndCompress(rest, 960, 0.7)
  tempImages.value = [...tempImages.value, ...urls]
}

async function submitPost() {
  if (isPosting.value) return
  if (!newContent.value.trim() && tempImages.value.length === 0) {
    showToast('请输入内容或图片')
    return
  }
  isPosting.value = true
  showToast({ message: '发布中...', duration: 0, forbidClick: true })
  try {
    const newPost = {
      content: newContent.value.trim(),
      images: tempImages.value,
      sender: identity.value,
      nickname: myName.value,
      avatar: myAvatar.value,
      create_time: Date.now(),
      likes: [],
      comments: [],
    }
    const { data, error } = await supabase.from('moments').insert([newPost]).select()
    if (error) throw error
    newPost._id = data && data[0] ? data[0].id : Date.now().toString()

    const normalized = normalizeMoment(newPost)
    cloudList.value = [normalized, ...cloudList.value].sort((a, b) => b.create_time - a.create_time)
    saveToLocal()

    showToast.clear && showToast.clear()
    showToast('发布成功')
    closeModal()
  } catch (e) {
    showToast.clear && showToast.clear()
    console.error('submitPost failed', e)
    showDialog({ title: '发布失败', message: '数据库异常：请先在 Supabase 执行 supabase-setup.sql 创建 moments 表', showCancelButton: false })
  } finally {
    isPosting.value = false
  }
}

function deleteCloudPost(id) {
  if (!id) return
  activeMenuId.value = null
  showDialog({
    title: '提示',
    message: '确认删除该动态？',
    showCancelButton: true,
  })
    .then(async () => {
      try {
        await supabase.from('moments').delete().eq('id', id)
        cloudList.value = cloudList.value.filter((i) => i._id !== id)
        saveToLocal()
        showToast('已删除')
      } catch (e) {
        /* 静默 */
      }
    })
    .catch(() => {})
}

function closeModal() {
  showPublishModal.value = false
  newContent.value = ''
  tempImages.value = []
}

function previewCloud(urls, idx) {
  showImagePreview({ images: urls, startPosition: idx, closeable: true })
}
function previewLocal(url) {
  showImagePreview({ images: [url], closeable: true })
}

watch(
  () => props.active,
  (v) => {
    if (v) getCloudMoments()
  }
)

onMounted(() => {
  loadFromLocal()
  getCloudMoments()
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="moment-page" :class="themeClass" @click="closeMenu">
    <!-- 女性视角头部 -->
    <template v-if="theme !== 'male'">
      <div class="hero">
        <div class="hero-overlay"></div>
        <div class="hero-inner">
          <div class="hero-copy">
            <span class="eyebrow">Exclusive Love Space</span>
            <span class="title">朋友圈</span>
            <span class="subtitle">把每天的心动，都认真收进这一页</span>
          </div>
          <div class="hero-card">
            <span class="hero-name">{{ myName }}</span>
            <img class="hero-avatar" :src="myAvatar" alt="" />
            <div class="publish-btn" @click.stop="showPublishModal = true">发动态</div>
          </div>
        </div>
      </div>

      <div class="summary-strip">
        <div class="summary-item">
          <span class="summary-value">{{ displayList.length }}</span>
          <span class="summary-label">动态</span>
        </div>
        <div class="summary-divider"></div>
        <div class="summary-item">
          <span class="summary-value">0</span>
          <span class="summary-label">置顶</span>
        </div>
        <div class="summary-divider"></div>
        <div class="summary-item">
          <span class="summary-value">{{ myName }}</span>
          <span class="summary-label">当前身份</span>
        </div>
      </div>
    </template>

    <!-- 男性视角头部 -->
    <template v-else>
      <div class="male-hero">
        <div class="male-copy">
          <span class="male-eyebrow">SYSTEM / MOMENTS</span>
          <span class="male-title">FEED :: LOVE</span>
          <span class="male-subtitle">SYNCED SIGNALS · ARCHIVE RUNNING</span>
        </div>
        <div class="male-profile">
          <img class="male-avatar" :src="myAvatar" alt="" />
          <div class="male-profile-text">
            <span class="male-name">{{ myName }}</span>
            <span class="male-role">ID {{ identity === 'user_a' ? 'A-01' : 'B-02' }}</span>
          </div>
          <div class="publish-btn male-publish" @click.stop="showPublishModal = true">POST</div>
        </div>
      </div>

      <div class="male-stats">
        <div class="stat-card">
          <span class="stat-label">STREAM</span>
          <span class="stat-value">{{ displayList.length }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">PINNED</span>
          <span class="stat-value">0</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">ROLE</span>
          <span class="stat-value">{{ myName }}</span>
        </div>
      </div>
    </template>

    <!-- 数据库未初始化提示 -->
    <div v-if="tableMissing" class="missing-tip">
      ⚠️ 朋友圈云端数据未就绪：请在 Supabase 控制台 SQL Editor 执行项目根目录的 supabase-setup.sql
    </div>

    <!-- 动态列表 -->
    <div class="moments-list scroll-area" :class="{ 'male-list': theme === 'male' }">
      <!-- 女性视角卡片 -->
      <template v-if="theme !== 'male'">
        <div
          v-for="(item, index) in displayList"
          :key="item._id || 'moment_' + index"
          class="moment-card"
          :style="{ '--i': index }"
        >
          <img class="item-avatar" :src="item.userAvatar" alt="" />
          <div class="moment-body">
            <div class="moment-head">
              <span class="item-name">{{ item.userName }}</span>
              <span class="item-time">{{ item.time }}</span>
            </div>
            <span class="item-text">{{ item.content }}</span>

            <img
              v-if="item.image"
              class="item-image-single"
              :src="item.image"
              alt=""
              @click.stop="previewLocal(item.image)"
            />

            <template v-if="item.images && item.images.length > 0">
              <img
                v-if="item.images.length === 1"
                class="item-image-single"
                :src="item.images[0]"
                alt=""
                @click.stop="previewCloud(item.images, 0)"
              />
              <div v-else class="img-grid">
                <img
                  v-for="(img, idx) in item.images"
                  :key="idx"
                  :src="img"
                  alt=""
                  class="grid-img"
                  @click.stop="previewCloud(item.images, idx)"
                />
              </div>
            </template>

            <div class="item-footer">
              <div v-if="(item.likes && item.likes.length > 0) || (item.comments && item.comments.length > 0)" class="interaction-box">
                <div v-if="item.likes && item.likes.length > 0" class="likes-row">
                  <span class="like-icon">❤️</span>
                  <span class="like-names">{{ item.likes.join('、') }}</span>
                </div>
                <div v-if="item.likes && item.likes.length > 0 && item.comments && item.comments.length > 0" class="line"></div>
                <div v-if="item.comments && item.comments.length > 0" class="comments-list">
                  <div
                    v-for="(comment, cIdx) in item.comments"
                    :key="cIdx"
                    class="comment-row"
                    @touchstart="onCommentPressStart(item, comment)"
                    @touchend="onCommentPressEnd"
                    @contextmenu.prevent
                  >
                    <span class="comment-user">{{ comment.nickname }}：</span>
                    <span class="comment-text">{{ comment.content }}</span>
                  </div>
                </div>
              </div>

              <div v-if="item._id" class="action-area" @click.stop>
                <div class="action-btn" @click="toggleMenu(item._id)">
                  <span class="dots">...</span>
                </div>
                <div class="pop-menu" :class="{ show: activeMenuId === item._id }">
                  <div class="menu-item" @click="toggleLike(item)">
                    <span class="menu-icon">{{ isLiked(item.likes) ? '❤️' : '🤍' }}</span>
                    <span>{{ isLiked(item.likes) ? '取消' : '点赞' }}</span>
                  </div>
                  <div class="menu-item" @click="showCommentInput(item)">
                    <span class="menu-icon">💬</span><span>评论</span>
                  </div>
                  <div class="menu-item delete-item" @click="deleteCloudPost(item._id)">
                    <span class="menu-icon">🗑️</span><span>删除</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 男性视角卡片 -->
      <template v-else>
        <div
          v-for="(item, index) in displayList"
          :key="item._id || 'moment_' + index"
          class="moment-card male-card"
          :style="{ '--i': index }"
        >
          <div class="male-card-head">
            <div class="male-identity">
              <img class="item-avatar" :src="item.userAvatar" alt="" />
              <div class="identity-text">
                <span class="item-name">{{ item.userName }}</span>
                <span class="item-time">{{ item.time }}</span>
              </div>
            </div>

            <div v-if="item._id" class="action-area" @click.stop>
              <div class="action-btn" @click="toggleMenu(item._id)">
                <span class="dots">···</span>
              </div>
              <div class="pop-menu" :class="{ show: activeMenuId === item._id }">
                <div class="menu-item" @click="toggleLike(item)">
                  <span class="menu-icon">{{ isLiked(item.likes) ? '❤️' : '🤍' }}</span>
                  <span>{{ isLiked(item.likes) ? '取消' : '点赞' }}</span>
                </div>
                <div class="menu-item" @click="showCommentInput(item)">
                  <span class="menu-icon">💬</span><span>评论</span>
                </div>
                <div class="menu-item delete-item" @click="deleteCloudPost(item._id)">
                  <span class="menu-icon">🗑️</span><span>删除</span>
                </div>
              </div>
            </div>
          </div>

          <span class="item-text">{{ item.content }}</span>

          <img v-if="item.image" class="item-image-single" :src="item.image" alt="" @click.stop="previewLocal(item.image)" />

          <template v-if="item.images && item.images.length > 0">
            <img v-if="item.images.length === 1" class="item-image-single" :src="item.images[0]" alt="" @click.stop="previewCloud(item.images, 0)" />
            <div v-else class="img-grid">
              <img
                v-for="(img, idx) in item.images"
                :key="idx"
                :src="img"
                alt=""
                class="grid-img"
                @click.stop="previewCloud(item.images, idx)"
              />
            </div>
          </template>

          <div class="item-footer">
            <div v-if="(item.likes && item.likes.length > 0) || (item.comments && item.comments.length > 0)" class="interaction-box">
              <div v-if="item.likes && item.likes.length > 0" class="likes-row">
                <span class="like-icon">❤️</span>
                <span class="like-names">{{ item.likes.join('、') }}</span>
              </div>
              <div v-if="item.likes && item.likes.length > 0 && item.comments && item.comments.length > 0" class="line"></div>
              <div v-if="item.comments && item.comments.length > 0" class="comments-list">
                <div
                  v-for="(comment, cIdx) in item.comments"
                  :key="cIdx"
                  class="comment-row"
                  @touchstart="onCommentPressStart(item, comment)"
                  @touchend="onCommentPressEnd"
                  @contextmenu.prevent
                >
                  <span class="comment-user">{{ comment.nickname }}：</span>
                  <span class="comment-text">{{ comment.content }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 悬浮发布按钮 -->
    <div class="fab-btn" @click.stop="showPublishModal = true">+</div>

    <!-- 发布弹窗 -->
    <div v-if="showPublishModal" class="modal-mask" @click.stop>
      <div class="modal-box">
        <span class="modal-title">发布动态</span>
        <textarea v-model="newContent" class="input-text" placeholder="说点只属于你们的话..." maxlength="500"></textarea>
        <div class="upload-area">
          <div v-for="(img, idx) in tempImages" :key="idx" class="img-wrap">
            <img :src="img" class="thumb" alt="" />
            <span class="thumb-close" @click="tempImages.splice(idx, 1)">×</span>
          </div>
          <div v-if="tempImages.length < 9" class="add-btn" @click="chooseImages">+</div>
        </div>
        <div class="modal-btns">
          <button class="btn cancel" @click="closeModal">取消</button>
          <button class="btn submit" :disabled="isPosting" @click.stop="submitPost">
            {{ isPosting ? '发布中...' : '发布' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 评论弹窗 -->
    <van-dialog
      v-model:show="showCommentModal"
      title="评论"
      show-cancel-button
      @confirm="submitComment"
    >
      <div class="comment-input-wrap">
        <textarea v-model="commentText" class="comment-input" placeholder="说点什么..." maxlength="200" rows="3"></textarea>
      </div>
    </van-dialog>
  </div>
</template>

<style scoped>
.moment-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.theme-female {
  background: linear-gradient(180deg, #fffdf5 0%, #ffe7ef 34%, #f7f8ff 100%);
}
.theme-male {
  background:
    radial-gradient(circle at 92% 8%, rgba(0, 229, 255, 0.12), transparent 40%),
    radial-gradient(circle at 10% 20%, rgba(106, 125, 255, 0.16), transparent 35%),
    linear-gradient(180deg, #121212 0%, #10131c 100%);
}
.theme-male::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(90deg, rgba(0, 229, 255, 0.08) 0, rgba(0, 229, 255, 0.08) 1px, transparent 1px, transparent 28px),
    repeating-linear-gradient(0deg, rgba(0, 229, 255, 0.05) 0, rgba(0, 229, 255, 0.05) 1px, transparent 1px, transparent 28px);
  opacity: 0.2;
  pointer-events: none;
  z-index: 0;
}
.moment-page > *:not(.modal-mask):not(.fab-btn) {
  position: relative;
  z-index: 1;
}

@keyframes heroRise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes cardIn {
  from { opacity: 0; transform: translateY(18px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes scanSweep {
  0% { transform: translateX(-120%); opacity: 0; }
  30% { opacity: 1; }
  60% { opacity: 0.5; }
  100% { transform: translateX(120%); opacity: 0; }
}

.moment-card {
  animation: cardIn 0.4s cubic-bezier(0.23, 1, 0.32, 1) both;
  /* 逐张错落入场，封顶 8 张避免长列表尾部空等 */
  animation-delay: calc(min(var(--i, 0), 8) * 40ms);
}

/* 女性视角 hero */
.theme-female .hero {
  position: relative;
  margin: 16px 16px 16px;
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(255, 166, 201, 0.92), rgba(144, 141, 255, 0.92));
  box-shadow: 0 18px 40px rgba(114, 84, 177, 0.18);
  animation: heroRise 0.5s cubic-bezier(0.23, 1, 0.32, 1) both;
  flex-shrink: 0;
}
.theme-female .hero-overlay {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.28), transparent 35%),
    radial-gradient(circle at bottom left, rgba(255, 255, 255, 0.22), transparent 28%);
}
.theme-female .hero-inner { position: relative; padding: 22px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
.theme-female .hero-copy { color: #fff; max-width: 62%; }
.theme-female .eyebrow { display: block; font-size: 11px; letter-spacing: 2px; opacity: 0.82; margin-bottom: 8px; }
.theme-female .title { display: block; font-size: 30px; font-weight: 800; line-height: 1.1; margin-bottom: 8px; }
.theme-female .subtitle { display: block; font-size: 13px; line-height: 1.6; opacity: 0.92; }
.theme-female .hero-card {
  width: 100px;
  padding: 12px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  text-align: center;
  flex-shrink: 0;
}
.theme-female .hero-name { display: block; color: #fff; font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.theme-female .hero-avatar { width: 76px; height: 76px; border-radius: 22px; border: 2px solid rgba(255, 255, 255, 0.65); object-fit: cover; }
.theme-female .publish-btn {
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 11px;
  color: #6b4cd6;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.9);
  cursor: pointer;
}
.theme-female .summary-strip {
  margin: 0 16px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 10px 28px rgba(129, 100, 160, 0.08);
  animation: heroRise 0.5s cubic-bezier(0.23, 1, 0.32, 1) 0.08s both;
  flex-shrink: 0;
}
.theme-female .summary-item { flex: 1; text-align: center; }
.theme-female .summary-value { display: block; font-size: 18px; font-weight: 800; color: #2f2545; }
.theme-female .summary-label { display: block; margin-top: 4px; font-size: 11px; color: #8a7da6; }
.theme-female .summary-divider { width: 1px; align-self: stretch; background: rgba(138, 125, 166, 0.14); }

/* 男性视角 hero */
.theme-male .male-hero {
  margin: 16px 16px 14px;
  padding: 18px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(18, 18, 18, 0.96), rgba(25, 28, 36, 0.94));
  border: 1px solid rgba(0, 229, 255, 0.18);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
  position: relative;
  overflow: hidden;
  animation: heroRise 0.5s cubic-bezier(0.23, 1, 0.32, 1) both;
  flex-shrink: 0;
}
.theme-male .male-hero::after {
  content: "";
  position: absolute;
  top: 0;
  left: -30%;
  height: 100%;
  width: 40%;
  background: linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.28), transparent);
  animation: scanSweep 4s linear infinite;
}
.theme-male .male-copy { display: flex; flex-direction: column; gap: 6px; }
.theme-male .male-eyebrow { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: rgba(0, 229, 255, 0.7); }
.theme-male .male-title { font-size: 20px; font-weight: 700; letter-spacing: 1px; color: #e8faff; }
.theme-male .male-subtitle { font-size: 11px; color: rgba(159, 200, 212, 0.8); }
.theme-male .male-profile { margin-top: 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.theme-male .male-avatar { width: 54px; height: 54px; border-radius: 6px; border: 1px solid rgba(0, 229, 255, 0.35); box-shadow: 0 10px 18px rgba(0, 0, 0, 0.35); object-fit: cover; }
.theme-male .male-profile-text { display: flex; flex-direction: column; gap: 4px; }
.theme-male .male-name { font-size: 14px; font-weight: 700; color: #e8faff; }
.theme-male .male-role { font-size: 10px; color: rgba(0, 229, 255, 0.7); letter-spacing: 1px; }
.theme-male .publish-btn.male-publish {
  margin-left: auto;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  color: #041018;
  background: linear-gradient(135deg, #00e5ff 0%, #6a7dff 100%);
  cursor: pointer;
}
.theme-male .male-stats { margin: 0 16px 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; animation: heroRise 0.6s ease 0.08s both; flex-shrink: 0; }
.theme-male .stat-card { padding: 10px 8px; border-radius: 6px; background: rgba(15, 18, 26, 0.92); border: 1px solid rgba(0, 229, 255, 0.18); text-align: center; }
.theme-male .stat-label { display: block; font-size: 10px; letter-spacing: 1px; color: rgba(0, 229, 255, 0.7); text-transform: uppercase; }
.theme-male .stat-value { display: block; margin-top: 4px; font-size: 16px; font-weight: 700; color: #e8faff; }

/* 列表 */
.moments-list { padding: 0 16px 90px; flex: 1; min-height: 0; }
.theme-female .moment-card {
  display: flex;
  gap: 12px;
  padding: 16px;
  margin-bottom: 16px;
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 12px 24px rgba(95, 75, 130, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.75);
}
.theme-female .item-avatar {
  width: 48px;
  height: 48px;
  border-radius: 18px;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 14px rgba(86, 64, 120, 0.12);
  object-fit: cover;
}
.theme-female .moment-body { flex: 1; min-width: 0; }
.theme-female .moment-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
.theme-female .item-name { color: #4d3e74; font-weight: 800; font-size: 16px; line-height: 1.4; }
.theme-female .item-time { font-size: 11px; color: #a094bb; flex-shrink: 0; padding-top: 2px; }

.item-text {
  font-size: 15px;
  line-height: 1.8;
  margin-bottom: 12px;
  display: block;
  word-wrap: break-word;
  word-break: break-all;
  white-space: pre-wrap;
}
.theme-female .item-text { color: #3f3657; }
.theme-male .item-text { font-size: 14px; color: #cfe9f3; line-height: 1.7; }

.theme-female .item-image-single { width: 100%; height: auto; border-radius: 18px; display: block; margin-bottom: 10px; box-shadow: 0 10px 18px rgba(71, 52, 96, 0.1); }
.theme-female .img-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.theme-female .grid-img { width: calc((100% - 16px) / 3); aspect-ratio: 1; object-fit: cover; border-radius: 16px; }
.theme-female .item-footer { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-top: 10px; position: relative; }

.action-area { position: relative; display: flex; align-items: center; margin-left: auto; }
.theme-female .action-btn {
  background: rgba(123, 92, 221, 0.12);
  padding: 0 10px;
  border-radius: 999px;
  color: #7b5cdd;
  font-weight: 700;
  font-size: 18px;
  line-height: 24px;
  height: 24px;
  cursor: pointer;
}
.dots { position: relative; top: -1px; }
.pop-menu {
  position: absolute;
  right: 38px;
  top: -2px;
  background: rgba(48, 35, 74, 0.96);
  border-radius: 16px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  width: 198px;
  overflow: hidden;
  opacity: 0;
  clip-path: inset(0 100% 0 0 round 16px);
  transition: clip-path 0.22s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.16s ease-out;
  box-shadow: 0 14px 30px rgba(27, 17, 48, 0.24);
}
.pop-menu.show { clip-path: inset(0 0 0 0 round 16px); opacity: 1; }
.menu-item {
  flex: 1;
  text-align: center;
  color: #fff;
  font-size: 13px;
  height: 40px;
  line-height: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  white-space: nowrap;
  cursor: pointer;
}
.menu-item:active { background: rgba(255, 255, 255, 0.08); border-radius: 12px; }
.menu-icon { margin-right: 4px; font-size: 14px; }
.delete-item { border-left: 1px solid rgba(255, 255, 255, 0.08); }

.theme-female .interaction-box {
  background: linear-gradient(180deg, rgba(246, 240, 255, 0.98), rgba(255, 255, 255, 0.96));
  padding: 10px 12px;
  border-radius: 18px;
  margin-bottom: 10px;
  font-size: 14px;
  border: 1px solid rgba(122, 88, 192, 0.08);
  flex: 1;
  min-width: 0;
}
.theme-female .likes-row { color: #6b4cd6; font-weight: 700; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; flex-wrap: wrap; }
.like-icon { margin-right: 6px; font-size: 12px; }
.like-names { word-break: break-word; }
.line { border-top: 1px solid rgba(122, 88, 192, 0.1); margin: 6px 0 8px 0; }
.comment-row { display: flex; align-items: flex-start; margin-bottom: 6px; line-height: 1.6; }
.comment-row:active { background: rgba(123, 92, 221, 0.06); border-radius: 8px; }
.comment-user { flex-shrink: 0; font-weight: 700; margin-right: 2px; }
.comment-text { flex: 1; word-wrap: break-word; word-break: break-all; white-space: pre-wrap; }
.theme-female .comment-user { color: #7b5cdd; }
.theme-female .comment-text { color: #3f3657; }

/* 男性视角卡片 */
.theme-male .moment-card {
  padding: 16px;
  margin-bottom: 14px;
  border-radius: 8px;
  background: rgba(10, 12, 18, 0.92);
  border: 1px solid rgba(0, 229, 255, 0.2);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}
.theme-male .male-card-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
.theme-male .male-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.theme-male .identity-text { display: flex; flex-direction: column; gap: 4px; }
.theme-male .item-avatar { width: 44px; height: 44px; border-radius: 6px; background-color: #151821; border: 1px solid rgba(0, 229, 255, 0.35); box-shadow: 0 0 0 1px rgba(0, 229, 255, 0.08); object-fit: cover; }
.theme-male .item-name { font-size: 14px; font-weight: 700; color: #e8faff; }
.theme-male .item-time { font-size: 10px; color: #7dd9ef; background: rgba(0, 229, 255, 0.12); padding: 2px 6px; border-radius: 4px; display: inline-block; width: fit-content; }
.theme-male .item-image-single { width: 100%; height: auto; border-radius: 6px; display: block; margin-bottom: 10px; box-shadow: 0 10px 18px rgba(0, 0, 0, 0.35); }
.theme-male .img-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.theme-male .grid-img { width: calc((100% - 16px) / 3); aspect-ratio: 1; object-fit: cover; border-radius: 6px; border: 1px solid rgba(0, 229, 255, 0.1); }
.theme-male .item-footer { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.theme-male .action-btn {
  background: rgba(0, 229, 255, 0.08);
  padding: 0 8px;
  border-radius: 4px;
  color: #00e5ff;
  font-weight: 700;
  font-size: 16px;
  line-height: 22px;
  height: 22px;
  border: 1px solid rgba(0, 229, 255, 0.3);
  cursor: pointer;
}
.theme-male .pop-menu { background: rgba(11, 14, 20, 0.96); border-radius: 8px; box-shadow: 0 16px 30px rgba(0, 0, 0, 0.4); border: 1px solid rgba(0, 229, 255, 0.2); }
.theme-male .menu-item { font-size: 12px; color: #e8faff; }
.theme-male .menu-item:active { background: rgba(0, 229, 255, 0.08); border-radius: 6px; }
.theme-male .interaction-box { background: rgba(12, 16, 22, 0.92); padding: 10px 12px; border-radius: 8px; margin-bottom: 10px; font-size: 13px; border: 1px solid rgba(0, 229, 255, 0.14); flex: 1; min-width: 0; }
.theme-male .likes-row { color: #72f0ff; font-weight: 700; font-size: 12px; margin-bottom: 6px; display: flex; align-items: center; flex-wrap: wrap; }
.theme-male .comment-user { color: #00e5ff; }
.theme-male .comment-text { color: #cfe9f3; }

/* 悬浮按钮 */
.fab-btn {
  position: absolute;
  bottom: 20px;
  right: 18px;
  width: 60px;
  height: 60px;
  color: white;
  font-size: 36px;
  text-align: center;
  line-height: 58px;
  z-index: 5;
  cursor: pointer;
}
.theme-female .fab-btn { background: linear-gradient(135deg, #ff8ab2 0%, #7b5cdd 100%); border-radius: 50%; box-shadow: 0 14px 28px rgba(123, 92, 221, 0.28); }
.theme-male .fab-btn { background: linear-gradient(135deg, #00e5ff 0%, #6a7dff 100%); border-radius: 10px; box-shadow: 0 14px 28px rgba(0, 229, 255, 0.28); }

/* 数据库未就绪提示 */
.missing-tip {
  margin: 0 16px 12px;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.6;
  background: rgba(255, 196, 87, 0.15);
  border: 1px solid rgba(255, 180, 84, 0.4);
  color: #b8860b;
}
.theme-male .missing-tip { background: rgba(255, 180, 84, 0.1); color: #ffca7a; }

/* 发布弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(22, 14, 40, 0.48);
  z-index: 2000;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding: 18px;
}
.modal-box { width: 100%; padding: 20px; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
.theme-female .modal-box { background: rgba(255, 255, 255, 0.94); border-radius: 26px; box-shadow: 0 20px 45px rgba(24, 15, 48, 0.24); }
.theme-male .modal-box { background: rgba(10, 12, 18, 0.96); border-radius: 10px; border: 1px solid rgba(0, 229, 255, 0.22); box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45); }
.modal-title { font-size: 18px; font-weight: 800; margin-bottom: 14px; display: block; text-align: center; }
.theme-female .modal-title { color: #2f2545; }
.theme-male .modal-title { color: #e8faff; }
.input-text {
  width: 100%;
  height: 96px;
  font-size: 15px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: none;
  outline: none;
  font-family: inherit;
  resize: none;
}
.theme-female .input-text { border-radius: 18px; background: #f8f5ff; color: #2f2545; }
.theme-male .input-text { border-radius: 6px; background: rgba(0, 229, 255, 0.08); color: #e8faff; border: 1px solid rgba(0, 229, 255, 0.2); }
.upload-area { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.img-wrap { width: 68px; height: 68px; position: relative; }
.thumb { width: 100%; height: 100%; object-fit: cover; }
.theme-female .thumb { border-radius: 16px; }
.theme-male .thumb { border-radius: 6px; }
.thumb-close {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ff4757;
  color: #fff;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  cursor: pointer;
}
.add-btn { width: 68px; height: 68px; font-size: 30px; display: flex; justify-content: center; align-items: center; cursor: pointer; }
.theme-female .add-btn { border-radius: 16px; border: 1px dashed rgba(123, 92, 221, 0.3); color: #7b5cdd; background: rgba(123, 92, 221, 0.06); }
.theme-male .add-btn { border-radius: 6px; border: 1px dashed rgba(0, 229, 255, 0.4); color: #00e5ff; background: rgba(0, 229, 255, 0.08); }
.modal-btns { display: flex; gap: 12px; }
.btn { flex: 1; font-size: 15px; height: 42px; line-height: 42px; border-radius: 999px; border: none; cursor: pointer; }
.theme-male .btn { border-radius: 6px; }
.theme-female .cancel { background: #f2eff8; color: #483a6f; }
.theme-male .cancel { background: rgba(18, 20, 28, 0.8); color: #9fc8d4; }
.theme-female .submit { background: linear-gradient(135deg, #ff8ab2 0%, #7b5cdd 100%); color: white; }
.theme-male .submit { background: linear-gradient(135deg, #00e5ff 0%, #6a7dff 100%); color: #041018; }

/* 评论输入 */
.comment-input-wrap { padding: 16px; }
.comment-input {
  width: 100%;
  border-radius: 12px;
  border: 1px solid #e5e0f0;
  background: #f8f5ff;
  padding: 10px 12px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  resize: none;
}
.theme-male .comment-input { background: rgba(0, 229, 255, 0.08); border-color: rgba(0, 229, 255, 0.25); color: #e8faff; }

/* 无障碍：系统开启“减弱动态效果”时，仅保留淡入、关闭位移与扫光 */
@media (prefers-reduced-motion: reduce) {
  .moment-card,
  .theme-female .hero,
  .theme-female .summary-strip,
  .theme-male .male-hero,
  .theme-male .male-stats {
    animation: cardFade 0.3s ease-out both;
    animation-delay: 0s;
  }
  .theme-male .male-hero::after { animation: none; }
  .pop-menu { transition: opacity 0.16s ease-out; }
}
@keyframes cardFade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
