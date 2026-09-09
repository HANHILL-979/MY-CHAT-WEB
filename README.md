# 专属空间 —— 双人私密 Web App

为两个人打造的轻量级私密移动端 Web 应用（PWA）：完整复刻自 uni-app 项目 Linda1 的情侣空间，
包含朋友圈、私聊、心情日历、恋爱清单、心动盲盒、默契挑战、戳一戳等全部功能。
基于 Vue 3 + Vant 4 + Supabase + Netlify，零成本、数据完全私有。

## 功能

- **朋友圈**：发动态（文字 + 最多 9 图）、双主题流卡片、点赞/评论/长按删评论/删动态、60 秒轮询同步、本地缓存。
- **秘密基地（私聊）**：气泡式对话，图片消息、上滑分页加载历史、自适应轮询（活跃 3s / 静默 15s）、长按删除、自定义聊天壁纸。
- **心情日历**：自绘月历 + 24 种心情 Emoji，写/看/改三模式，最多 9 张配图。
- **恋爱清单**：100 件小事逐字复刻，打卡上传合照凭证、进度条、双视角网格/行式列表。
- **心动盲盒**：16 项奖池、狂暴摇晃动画、开奖弹窗 + 满屏撒花。
- **默契挑战**：5 道题两阶段答题（我选 → 猜 TA 选）、匹配 +20 分、连击、最高分本地记录、本局记录。
- **戳一戳**：戳对方全屏爱心霸屏动效 + 物理震动，双方累计次数统计，3 秒轮询接收对方的戳。
- **双主题**：女性视角（治愈系粉金 + ZCOOL XiaoWei 字体）/ 男性视角（赛博极客 + JetBrains Mono），随身份自动切换。
- **身份绑定**：URL 参数首次绑定设备身份（`?user=大椰树` / `?user=小椰宝`），LocalStorage 持久化，无需注册登录。
- **PWA**：iOS Safari「添加到主屏幕」即得全屏原生 App 级体验。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端框架 | Vue 3 (Composition API, `<script setup>`) + Vite |
| UI 组件库 | Vant 4（Toast / Dialog / ImagePreview 等） |
| 后端 | Supabase (PostgreSQL + Realtime，RLS Disabled 免鉴权) |
| 托管 | Netlify（静态 CDN，绑定 GitHub 自动 CI/CD） |

## 本地开发

```bash
npm install     # 安装依赖
npm run dev     # 启动开发服务器（默认 http://localhost:5173）
npm run build   # 生产构建，输出到 dist/
```

首次访问时通过 URL 参数绑定身份进行双端测试：

- http://localhost:5173/?user=大椰树 （→ `user_a`，🌴，男性视角主题）
- http://localhost:5173/?user=小椰宝 （→ `user_b`，🥥，女性视角主题）

旧版姓名（小郭 / 黄其宏）作为兼容别名依然可绑定。绑定后参数自动从 URL 移除；清除浏览器 localStorage 可重置身份。

## 数据库结构（Supabase）

> 新增表与加列请先在 Supabase Dashboard → SQL Editor 执行项目根目录的 **`supabase-setup.sql`**。

**表 `messages`**（已挂载 `supabase_realtime`，前端订阅 INSERT 事件）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint, PK | 自增 |
| sender | text | `'user_a'` \| `'user_b'` |
| content | text | 消息正文（图片消息存 dataURL） |
| created_at | timestamptz | 默认 `now()` |

**表 `diaries`**（心情日历，`supabase-setup.sql` 会补 `date_str` / `images` / `writer` 列）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint, PK | 自增 |
| author / writer | text | `'user_a'` \| `'user_b'` |
| mood | text | 心情 Emoji |
| content | text | 日记正文 |
| date_str | text | `'YYYY-MM-DD'` 日历定位 |
| images | jsonb | 配图 dataURL 数组 |
| created_at | timestamptz | 默认 `now()` |

**表 `moments`**（朋友圈）：content / images jsonb / sender / nickname / avatar / likes jsonb / comments jsonb / create_time bigint

**表 `couple_tasks`**（恋爱清单打卡）：task_id int / title / image_url / create_time bigint / writer

**表 `love_poke`**（戳一戳）：sender / create_time bigint / is_read boolean

Supabase 凭证位于 `src/supabase.js`（publishable key，可安全暴露在前端）。

## 部署（Netlify）

仓库根目录已含 `netlify.toml`（构建命令 `npm run build`，发布目录 `dist`，含 SPA 回退规则）。
推送到 GitHub main 分支即自动部署。

> 注：`div[class*="netlify"]` 等屏蔽规则已在 `src/assets/global.css` 中隐藏 Netlify 注入的挂件。

## 工程约束

1. **隐藏 Netlify 水印**：`src/assets/global.css` 中强制屏蔽，勿删除。
2. **图片存储**：当前用 canvas 压缩为 dataURL 直存数据库（未开通 Supabase Storage）；单图压缩至 ~960-1280px / quality 0.7-0.8。
3. **iOS 键盘适配**：输入框聚焦 + `visualViewport` resize 时聊天列表自动触底（见 `ChatRoom.vue`）。
4. **移动端锁定**：`index.html` 的 viewport 与 iOS web-app meta 不可移除。

## 目录结构

```
├── public/
│   ├── manifest.json       # PWA 配置（standalone 模式）
│   ├── icon.png            # 应用图标
│   └── static/             # Linda1 静态资源（photo*.jpg / icon-*.png）
├── src/
│   ├── assets/global.css   # 全局样式 + 双主题字体 + Netlify 挂件屏蔽
│   ├── components/
│   │   ├── ChatRoom.vue    # 私聊：历史分页/实时订阅/图片消息/长按删除/壁纸
│   │   ├── MomentCircle.vue# 朋友圈：发布/点赞/评论/删除/轮询
│   │   ├── MinePage.vue    # 我的：资料卡/功能入口/专属密码/戳一戳
│   │   ├── DiaryPage.vue   # 心情日历：月历/写看改/配图
│   │   ├── RecordList.vue  # 恋爱清单：100 件小事打卡
│   │   ├── GachaBox.vue    # 心动盲盒：摇晃动画/开奖弹窗/撒花
│   │   └── QuizGame.vue    # 默契挑战：两阶段答题/计分/记录
│   ├── utils/
│   │   ├── image.js        # 选图/canvas 压缩/图片识别/震动
│   │   └── time.js         # 时间戳解析/多格式时间格式化
│   ├── identity.js         # 身份绑定（URL 参数 → LocalStorage）
│   ├── theme.js            # 双主题状态（随身份联动）
│   ├── supabase.js         # Supabase 客户端单例
│   ├── App.vue             # 首页入口 + 三 Tab + 子页路由 + 未读红点
│   └── main.js             # 入口
├── index.html
├── netlify.toml            # Netlify 构建配置 + SPA 回退
├── supabase-setup.sql      # 新表建表 + diaries 加列脚本（需手动执行）
└── vite.config.js          # Vant 按需引入
```

## 复刻说明（对照 Linda1）

| Linda1 页面 | 本项目对应 | 说明 |
| --- | --- | --- |
| index（主题选择入口） | App.vue 首页 | 双视角 mode-card + 入口网格 |
| moment（朋友圈） | MomentCircle.vue | 全逻辑复刻（点赞防抖/评论/删除/60s 轮询/缓存 50 条） |
| chat（私聊） | ChatRoom.vue | 分页/去重/自适应轮询/长按删除/壁纸 |
| mine（我的） | MinePage.vue | 资料卡/入口/专属密码/戳一戳（3s 轮询 + 震动） |
| diary（心情日历） | DiaryPage.vue | 24 心情/月历/写看改/9 图 |
| record（恋爱清单） | RecordList.vue | 100 件小事逐字复刻 + 打卡 |
| gacha（心动盲盒） | GachaBox.vue | 16 项奖池/摇晃/撒花 |
| quiz（默契挑战） | QuizGame.vue | 5 题/两阶段/+20 连击/最高分 |

技术栈映射：uniCloud JQL → Supabase PostgREST；uni.chooseImage → input[file] + canvas 压缩；
uni.vibrate → navigator.vibrate；uni.previewImage → Vant showImagePreview；
身份映射：Linda1 boy/girl → user_a(大椰树)/user_b(小椰宝)，主题随身份自动联动（无需重启）。
