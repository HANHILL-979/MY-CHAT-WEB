<script setup>
import { ref } from 'vue'
import { displayName } from './identity'
import ChatRoom from './components/ChatRoom.vue'
import MoodDiary from './components/MoodDiary.vue'

const activeTab = ref(0)
</script>

<template>
  <div class="app-shell">
    <!-- 顶部导航：标题 + 身份快速切换 -->
    <van-nav-bar :border="false" class="app-nav">
      <template #title>
        <span class="nav-title">专属空间</span>
      </template>
      <template #right>
        <!-- 身份已锁定，仅展示当前设备绑定的身份 -->
        <span class="identity-tag">
          <van-icon name="manager-o" />
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

/* 身份徽标（只读，不可切换） */
.identity-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
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
