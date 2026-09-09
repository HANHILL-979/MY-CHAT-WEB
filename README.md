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
- **双主题**：大椰树（女生・治愈系粉金 + ZCOOL XiaoWei 字体）/ 小椰宝（男生・日落玻璃 + 苹果液态玻璃质感），随身份自动切换。
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
npm run dev     # 开发服务器，带热更新（默认 http://localhost:5173）
npm run build   # 生产构建，输出到 dist/
npm run preview -- --port 4173 --strictPort   # 预览打包后的产物（上线前自检用）
```

首次访问时通过 URL 参数绑定身份进行双端测试：

- http://localhost:5173/?user=大椰树 （→ `user_a`，🌴，女生・治愈系主题）
- http://localhost:5173/?user=小椰宝 （→ `user_b`，🥥，男生・日落玻璃主题）

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

## 设计与主题系统

主题化靠 **CSS 变量令牌（design tokens）** 驱动，而不是在每个组件里重复写颜色：

```css
/* src/assets/global.css 的 .theme-male */
--ios-bg: transparent;                     /* 页面背景交给 app-shell 的日落图 */
--ios-surface:   rgba(255, 255, 255, 0.10); /* 主玻璃面：卡片 */
--ios-surface-2: rgba(255, 255, 255, 0.16); /* 次玻璃面：嵌套 / 气泡 */
--ios-surface-3: rgba(255, 255, 255, 0.24); /* 按压态 */
--ios-fill:  rgba(255, 255, 255, 0.14);     /* 输入框填充 */
--ios-accent:#0a84ff;  --ios-green:#30d158;  --ios-red:#ff453a;  --ios-orange:#ff9f0a;
--ios-text:  #ffffff;  --ios-text-2: rgba(255,255,255,.75);  --ios-text-3: rgba(255,255,255,.5);
--ios-separator: rgba(255, 255, 255, 0.16);  --ios-radius: 12px;
```

关键架构约定：

1. **全局注入玻璃材质**。`global.css` 里一条选择器列表统一给所有玻璃容器加 `backdrop-filter: blur(24px) saturate(160%)` + 顶部受光描边 + `inset 0 1px 0` 高光。组件只声明 `background: var(--ios-surface)` 就能拿到毛玻璃，无需重复写 backdrop-filter。
2. **令牌定义在 `.theme-male`，而 `themeClass` 绑在根元素 `.app-shell` 上**，所以所有后代组件都能直接 `var(--ios-*)`。改主题风格只需改令牌值。
3. **特异性约定**：scoped 样式编译后带 `[data-v-xxx]`，天然赢过 `global.css` 的同名规则。因此全局注入的是“默认玻璃”，组件需要偏离时直接写自己的 scoped 规则覆盖（如 `left-bubble` 显式 `border: none`）。
4. **全屏子页需单独铺背景**。DiaryPage / RecordList / GachaBox / QuizGame 用 `position: fixed; inset: 0`，宽屏下会超出 480px 的 app-shell，所以它们的 `.theme-male` 直接铺同款日落图（而非 `transparent`），避免露出黑边。
5. **无障碍回退**：`prefers-reduced-transparency: reduce` 时令牌重定义为实底深色（#2c2c2e）并去掉 blur；`prefers-reduced-motion: reduce` 时动效只保留透明度变化。

## 目录结构

```
├── public/
│   ├── manifest.json       # PWA 配置（standalone 模式）
│   ├── icon.png            # 应用图标
│   ├── sunset-bg.jpg       # 男性主题日落实景背景（已转正 + 压缩至 ~315KB）
│   └── static/             # Linda1 静态资源（photo*.jpg / icon-*.png）
├── src/
│   ├── assets/global.css   # 全局样式 + 双主题令牌系统（玻璃质感）+ Netlify 挂件屏蔽
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
身份映射：user_a（大椰树・girl）/ user_b（小椰宝・boy），主题随身份自动联动（无需重启）。

## 经验总结（踩坑与决策记录）

### 数据层

| 问题 | 根因 | 做法 |
| --- | --- | --- |
| 发一句“你好”收到很多句 | Realtime INSERT 订阅与轮询两个通道各插一次 | 入库统一按 `id` 去重合并，只信一个数据源 |
| 时间戳错乱 | `Date.parse` 对 ISO 8601 带/不带时区的解释不一致 | 时间字段格式归一（timestamptz 或 create_time bigint），自己写解析 + 本地格式化（`utils/time.js`） |
| 打开页面卡顿 | 全量拉取 + 每次重渲染 | 分页 `.range()` + 本地缓存 + `v-show` 保留 Tab 状态 |
| 新表建不出来 | 前端无法建表 | 先在 Supabase Dashboard → SQL Editor 执行 `supabase-setup.sql` |

### 布局层

- **Tab 栏遮挡聊天输入栏**：`van-tabbar` 默认 `fixed` 会脱离 flex 流。改 `:fixed="false"` 让 `.app-shell` 的 flex 列布局自己分配高度，输入栏与 Tab 栏不再重叠。
- **全屏浮层与窄屏容器的冲突**：`position: fixed; inset: 0` 的子页永远按视口算，而 app-shell 限宽 480px。背景不能图省事写 `transparent`，否则宽屏露黑边。
- **样式没生效先查类名绑定**：`.home-overlay.theme-male` 写了但模板忘了 `:class="themeClass"`，选择器永远不匹配。scoped 样式里用主题类修饰符时，必须确认根元素真的绑上了。

### 主题设计

- **风格迭代路径**：赛博朋克（霓虹青 + 网格线 + 等宽字体 + 全大写英文）→ iOS 深色模式（令牌系统）→ 日落液态玻璃。前两轮都是“纯灰实底卡片”，缺的是背景透出而非颜色。
- **去装饰比加装饰便宜**：网格线、扫描线、呼吸动画统一用 `content: none` 关掉伪元素 + 删 keyframes，比逐条改颜色干净。
- **英文标签是“不像苹果”的主因**：`LOVE::TASKS`、`MYSTERYBOX`、`◄ BACK` 这类中二标签全部中文化，视觉才真的变高级。
- **玻璃质感三件套**：半透白背景 + `backdrop-filter: blur() saturate()` + 顶部 1px 受光描边。缺了描边就只是“半透”，不像玻璃。
- **令牌系统价值**：第三轮从深灰改玻璃，主体只改了 `global.css` 的令牌值 + 一处背景注入，组件几乎没动。

### 部署与验证

- **“UI 一点没变”多数不是代码问题，而是部署延迟或本地缓存**。Netlify 爬 GitHub 自动部署需要 1–2 分钟，加上浏览器/Service Worker 缓存，很容易误判为“没改”。
- **上线前用 `npm run preview` 先验本地产物**，确认效果再推；推完看线上 bundle 特征字符串（如 `--ios-bg`、`0a84ff`）确认部署真的完成，而不是靠眼睛猜。
- **主题存储 key 要随语义变更而升级**：`user_gender` → `user_gender_v2`。性别映射反转后如果继用旧 key，老设备会拿着旧主题值粘住不改。
- **图片资源先体检再入库**：微信传图往往带 EXIF 旋转（实际横躺）且体积大（4.3MB）。用 `System.Drawing` 转正 + 限宽 1280 + quality 80 压到 315KB 再放进 `public/`。

### 工程约束

- 图片未开通 Supabase Storage，统一 canvas 压缩为 dataURL 直存数据库——简单但会快速撞行数/容量上限，是阶段三需替换的技术债。
- RLS Disabled 免鉴权 = 任何拿到 publishable key 的人都能读写。仅适用于两人自用的私密空间，不可直接拿去公网多用户场景。
- 轮询（聊天 3s/15s、朋友圈 60s、戳一戳 3s）是 Realtime 断线时的兼容方案，代价是后台标签页仍会请求；已用 `document.hidden` 守卫。
