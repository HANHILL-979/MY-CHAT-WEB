<script setup>
import { ref } from 'vue'
import { identity, displayName, identityProfiles, identityNames } from './identity'
import ChatRoom from './components/ChatRoom.vue'
import MoodDiary from './components/MoodDiary.vue'

const activeTab = ref(0)
const showSwitch = ref(false)

// 切换身份
function switchIdentity(value) {
  identity.value = value
  showSwitch.value = false
  // 切换后刷新页面，让 ChatRoom 重新加载消息
  window.location.reload()
}
</script>

<template>
  <div class="app-shell">
    <!-- 顶部导航：标题 + 身份快速切换 -->
    <van-nav-bar :border="false" class="app-nav">
      <template #title>
        <span class="nav-title">专属空间</span>
      </template>
      <template #right>
        <!-- 点击头像可切换身份 -->
        <span class="identity-tag" @click="showSwitch = true">
          <span class="identity-avatar">{{ identityProfiles[identity].avatar }}</span>
          {{ displayName }}
        </span>
      </template>
    </van-nav-bar>

    <!-- 内容区：聊天 / 心情日记 -->
    <div class="app-content">
      <ChatRoom v-show="activeTab === 0" />
      <MoodDiary v-show="activeTab === 1" />
    </div>

    <!-- 底部 Tabbar -->
    <van-tabbar v-model="activeTab" class="app-tabbar" safe-area-inset-bottom>
      <van-tabbar-item icon="chat-o">私聊</van-tabbar-item>
      <van-tabbar-item icon="bookmark-o">心情日记</van-tabbar-item>
    </van-tabbar>

    <!-- 身份切换弹窗 -->
    <van-action-sheet
      v-model:show="showSwitch"
      :actions="[
        { name: `${identityProfiles.user_a.avatar} 切换为${identityNames.user_a}`, value: 'user_a' },
        { name: `${identityProfiles.user_b.avatar} 切换为${identityNames.user_b}`, value: 'user_b' },
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
  background-color: #f8fafc;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.app-nav {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  flex-shrink: 0;
}

.nav-title {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
}

:deep(.van-nav-bar__content) {
  height: 50px;
}

:deep(.van-nav-bar__right) {
  padding-right: 8px;
}

/* 身份徽标（点击可切换） */
.identity-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 4px 4px;
  background: rgba(255, 255, 255, 0.22);
  border-radius: 16px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.identity-tag:active {
  background: rgba(255, 255, 255, 0.35);
}

.identity-avatar {
  width: 26px;
  height: 26px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.35);
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.app-tabbar {
  flex-shrink: 0;
}
</style>
