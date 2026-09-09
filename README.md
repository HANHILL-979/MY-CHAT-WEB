# 专属空间 —— 双人私密 Web App

为两个人打造的轻量级私密移动端 Web 应用（PWA）：实时私聊 + 心情日记打卡。
基于 Vue 3 + Vant 4 + Supabase + Netlify，零成本、数据完全私有。

## 功能

- **实时私聊**：气泡式对话，Supabase Realtime 毫秒级同步，历史消息自动加载，发送防抖 + 失败重试。
- **心情日记**：Emoji 心情打卡 + 文字记录，双列瀑布流展示，日历视图高亮打卡日并支持按日期反查。
- **身份绑定**：URL 参数首次绑定设备身份（`?user=小郭` / `?user=黄其宏`），LocalStorage 持久化，无需注册登录。
- **PWA**：iOS Safari「添加到主屏幕」即得全屏原生 App 级体验。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端框架 | Vue 3 (Composition API, `<script setup>`) + Vite |
| UI 组件库 | Vant 4（`unplugin-vue-components` 按需引入） |
| 后端 | Supabase (PostgreSQL + Realtime WebSocket，RLS Disabled 免鉴权) |
| 托管 | Netlify（静态 CDN，绑定 GitHub 自动 CI/CD） |

## 本地开发

```bash
npm install     # 安装依赖
npm run dev     # 启动开发服务器（默认 http://localhost:5173）
npm run build   # 生产构建，输出到 dist/
```

首次访问时通过 URL 参数绑定身份进行双端测试：

- http://localhost:5173/?user=小郭 （→ `user_a`）
- http://localhost:5173/?user=黄其宏 （→ `user_b`）

绑定后参数自动从 URL 移除；清除浏览器 localStorage 可重置身份。

## 数据库结构（Supabase）

**表 `messages`**（已挂载 `supabase_realtime`，前端订阅 INSERT 事件）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint, PK | 自增 |
| sender | text | `'user_a'` \| `'user_b'` |
| content | text | 消息正文 |
| created_at | timestamptz | 默认 `now()` |

**表 `diaries`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint, PK | 自增 |
| author | text | `'user_a'` \| `'user_b'` |
| mood | text | 心情 Emoji（如 '😊'） |
| content | text | 日记正文 |
| created_at | timestamptz | 默认 `now()` |

Supabase 凭证位于 `src/supabase.js`（publishable key，可安全暴露在前端）。

## 部署（Netlify）

仓库根目录已含 `netlify.toml`（构建命令 `npm run build`，发布目录 `dist`，含 SPA 回退规则）。

**方式一（推荐）：GitHub + Netlify 自动 CI/CD**

1. 在 GitHub 创建空仓库并推送本目录：
   ```bash
   git init
   git add .
   git commit -m "init: 双人私密空间 App"
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
2. Netlify → Add new site → Import an existing project → 授权并选中该仓库。
3. 构建配置会被 `netlify.toml` 自动接管，点 Deploy 即可。之后每次 `git push` 自动部署。

**方式二：拖拽手动部署**

`npm run build` 后把 `dist` 文件夹拖入 Netlify 的 Deploys 页面。缺点：每次更新需手动重新拖拽。

> 注：`div[class*="netlify"]` 等屏蔽规则已在 `src/assets/global.css` 中隐藏 Netlify 注入的挂件。

## 工程约束

1. **隐藏 Netlify 水印**：`src/assets/global.css` 中强制屏蔽，勿删除。
2. **状态管理**：目前用 `ref` 局部状态；组件嵌套加深后引入 Pinia 接管 `messages` / `diaries`。
3. **iOS 键盘适配**：输入框聚焦 + `visualViewport` resize 时聊天列表自动触底（见 `ChatRoom.vue`）。
4. **移动端锁定**：`index.html` 的 viewport 与 iOS web-app meta 不可移除。

## 目录结构

```
├── public/
│   ├── manifest.json       # PWA 配置（standalone 模式）
│   └── icon.png            # 应用图标
├── src/
│   ├── assets/global.css   # 全局样式 + Netlify 挂件屏蔽
│   ├── components/
│   │   ├── ChatRoom.vue    # 聊天：历史加载/实时订阅/防抖/重试
│   │   └── MoodDiary.vue   # 日记：Emoji 打卡/瀑布流/日历反查
│   ├── identity.js         # 身份绑定（URL 参数 → LocalStorage）
│   ├── supabase.js         # Supabase 客户端单例
│   ├── App.vue             # 顶部身份徽标 + 底部 Tabbar
│   └── main.js             # 入口
├── index.html
├── netlify.toml            # Netlify 构建配置 + SPA 回退
└── vite.config.js          # Vant 按需引入
```

## 开发路线图

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 一 | 双 Tab 基础形态 + 实时监听 + 日记写入 | ✅ 完成 |
| 二 | 身份固化 / 发送 Loading 与重试 / 日历打卡 / iOS 键盘适配 | ✅ 完成 |
| 三 | Supabase Storage 富媒体（图片/语音气泡） | 待启动 |
| 四 | RESTful Webhook（RTL-SDR 数据流）/ 本地大模型周报 / MQTT 硬件联动 / Web Push | 远期 |

系统级优化备忘：Pinia 状态接管、`visibilitychange` 断线重连、`.range()` 分页 + Vant List 上拉加载、已读未读（UPDATE 回写）。
