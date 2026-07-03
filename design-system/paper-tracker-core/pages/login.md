# Login Page Overrides

> **PROJECT:** Paper Tracker Core
> **PAGE:** Login / Authentication
> **DIRECTION:** Grid Intelligence + Research Command Center
> **INTENT:** 不是普通 SaaS 登录页，而是“进入科研控制台”的第一屏

> 本文件覆盖同一设计系统目录下的 `MASTER.md`。
> 如果 Master 与本页冲突，以本页为准。

---

## 1. Page Concept

登录页需要同时传达两种气质：

- **科研可信度**：像高质量研究平台，而不是泛 AI 工具站
- **电网科技感**：像进入一个能源网络与知识网络叠加的控制台

建议将场景定义为：

**“Research Grid Nexus”**

用户打开页面时，感受到的是：

- 一个深海蓝黑色的数据场
- 背后有缓慢流动的电网线路、节点脉冲和论文网络图
- 前景是一张高精度玻璃控制卡片，像科研站登录终端

关键词：

- scientific
- grid intelligence
- control room
- holographic
- deep energy blue
- academic precision
- cinematic glow

---

## 2. Visual Strategy

### 2.1 Style Fusion

本页不直接使用 Master 的紫金主色，也不走泛 Web3 风格。建议融合以下 3 种语言：

1. **Academic Editorial**
   - 保留研究平台的可信与克制
2. **HUD / Sci-Fi FUI**
   - 只借用细线、扫描、坐标标记、数据刻度
   - 不能做成游戏界面
3. **Glassmorphism**
   - 只用于登录卡片与状态浮层
   - 背景负责氛围，前景负责可读性

### 2.2 Tone Control

要“炫”，但不能“花”。

允许：

- 细腻辉光
- 电流脉冲
- 网格透视
- 图谱节点呼吸
- 玻璃反射

禁止：

- 大面积紫粉 vaporwave
- 高频闪烁
- 过多粒子
- 全屏持续扫描线
- 厚重霓虹边框

---

## 3. Color Overrides

### 3.1 Core Palette

使用电网与科研场景专属配色：

| Role | Hex | Usage |
|------|-----|-------|
| Canvas Base | `#07111F` | 页面最底层背景 |
| Canvas Deep | `#0A1A2F` | 第二层大面积背景 |
| Grid Cyan | `#63D1FF` | 主发光线条、聚焦边框 |
| Energy Blue | `#2F7BFF` | 主按钮、图谱高亮 |
| Voltage Mint | `#62F5C2` | 成功状态、能流节点 |
| Research Gold | `#F7C86B` | 数据徽章、科研荣誉点缀 |
| Plasma Violet | `#7B6CFF` | 极少量辅助渐变，控制在 8% 以下 |
| Text High | `#EAF4FF` | 主文案 |
| Text Mid | `#9FB6CE` | 次级说明 |
| Line Soft | `rgba(120, 173, 220, 0.18)` | 结构边线 |
| Glass Fill | `rgba(9, 22, 39, 0.56)` | 卡片玻璃层 |

### 3.2 Background Formula

页面背景不要纯色，建议由 4 层叠加：

1. 深色径向渐变底色
2. 低透明度透视网格
3. 电网拓扑流线
4. 远景研究图谱雾层

推荐背景感受：

- 左上偏冷青
- 右下偏深蓝
- 中间稍微抬亮，托起登录卡片

---

## 4. Typography Overrides

### 4.1 Pairing

登录页建议覆盖 Master 字体方案，采用更强科技感但仍可读的组合：

- **Display / Data Headings:** `Orbitron`
- **Body / Form / UI:** `Exo 2`

使用规则：

- `Orbitron` 仅用于主标题、数据数值、章节标签、装饰性 telemetry
- 表单、按钮、正文、说明全部用 `Exo 2`

### 4.2 Type Scale

| Element | Size | Weight | Notes |
|--------|------|--------|------|
| Hero Title | `clamp(40px, 5vw, 68px)` | 700 | 宽松字距，不能拥挤 |
| Hero Subtitle | `18px` | 400 | 不超过 2 行 |
| Panel Title | `28px` | 600 | 明确进入动作 |
| Input Label | `12px` | 500 | 全大写或小型大写均可 |
| Input Text | `16px` | 400 | 高可读 |
| Meta Data | `12px` | 500 | 用于节点、指标、协议状态 |

### 4.3 Copy Tone

文案要短，像控制台，不像营销页。

推荐：

- `Enter the Research Grid`
- `Secure access to your private paper database`
- `Authenticated control for feeds, notes and agent workflows`

避免：

- “Welcome back to the best AI platform”
- “Boost your productivity”

---

## 5. Layout Overrides

### 5.1 Desktop Layout

采用 **6.5 / 5.5 split-screen**：

- **Left 54%**：沉浸式视觉区
- **Right 46%**：登录控制卡

页面最外层：

- min-height: `100vh`
- container max-width: `1600px`
- outer padding desktop: `24px`

### 5.2 Left Visual Zone

左侧不是静态海报，而是“登录前科研态势视图”。

包含 4 个层次：

1. **Top Eyebrow**
   - `PAPER TRACKER PRO / SECURE ACCESS NODE`
2. **Main Headline**
   - 两行以内，极具进入感
3. **Narrative Subcopy**
   - 说明平台价值，但控制在 90 字符以内
4. **Ambient Data Modules**
   - 3 个悬浮信息块，表现科研与电网融合

建议 3 个信息块：

- `Feed Signal`
  - Live ingestion status
- `Research Graph`
  - Connected papers / citations / agents
- `Private Vault`
  - Personal database isolation enabled

### 5.3 Right Login Zone

右侧登录卡片像一块高精度玻璃控制面板：

- width: `min(480px, 100%)`
- border radius: `28px`
- padding: `32px 32px 28px`
- backdrop blur: `18px`
- border: `1px solid rgba(99, 209, 255, 0.18)`
- inner highlight: 顶部左侧轻微反射
- outer glow: 青蓝色超轻辉光

卡片内部结构：

1. 品牌与状态条
2. 标题与说明
3. 身份验证表单
4. 次级入口
5. 安全说明

---

## 6. Component Spec

### 6.1 Brand Header

卡片顶部不要传统 logo + slogan，可采用：

- 左侧：抽象电网节点 Logo
- 右侧：状态胶囊

状态胶囊文案示例：

- `NODE SECURED`
- `PRIVATE DB READY`

胶囊样式：

- 背景：`rgba(99, 209, 255, 0.10)`
- 边框：`rgba(99, 209, 255, 0.24)`
- 文本：`#AEE6FF`

### 6.2 Login Form

字段顺序：

1. `Email / Username`
2. `Password`
3. `Remember this device`
4. `Sign In`

扩展入口：

- `Use organization access key`
- `Forgot password`

输入框样式：

- 背景：`rgba(5, 14, 28, 0.66)`
- 边框：`1px solid rgba(126, 161, 196, 0.18)`
- Focus：外发光 + 细线亮边
- 占位符：`#6F89A4`

输入框内部左图标建议：

- 用户：Lucide `UserRound`
- 密码：Lucide `KeyRound`

### 6.3 Primary Button

主按钮必须有“能量启动”感：

- 背景：`linear-gradient(135deg, #2F7BFF 0%, #63D1FF 52%, #62F5C2 100%)`
- 文本：深蓝黑 `#04101C`
- 高度：`52px`
- radius：`16px`
- hover：亮度提升 + 内阴影变化
- active：轻微下压，不要缩放

按钮文案推荐：

- `Enter Workspace`

不要用：

- `Login`
- `Submit`

### 6.4 Secondary Access

如果需要扩展企业或校园登录，可放在主按钮下：

- `SSO for Research Labs`
- `Continue with Institution`

样式：

- 透明深底
- 边框微亮
- hover 时边框亮起，背景微抬

### 6.5 Security Footer

卡片底部建议保留一个安全说明区：

- 图标：盾牌 / 锁 / 节点
- 文案：
  - `Your papers, notes and agent sessions stay inside your private database.`

该区的作用是把“数据库隔离”直接在登录页传达出来。

---

## 7. Signature Visual Elements

### 7.1 Background Motif

主视觉建议组合：

- 透视网格
- 节点连线
- 类论文知识图谱的圆点与边
- 一条从左下到右上的“能量输运弧线”

图形语言要像：

- 电网调度图
- 科学知识图谱
- 实验室控制台

而不是：

- 区块链货币网站
- 游戏启动器

### 7.2 Floating Data Chips

建议在左侧放 3 个漂浮卡片，增强场景感：

1. `1,284 papers indexed`
2. `42 feeds synchronized`
3. `Personal vault isolated`

卡片风格：

- 半透明
- 极细边框
- 带一点投影和辉光
- hover 不需要强交互，只是轻微漂浮

### 7.3 Logo Direction

可设计为一个抽象 mark：

- 一个圆形核心节点
- 向外扩散 4 条导线
- 右上角带一颗小论文节点

含义：

- 论文网络
- 电网拓扑
- 私有控制节点

---

## 8. Motion Rules

只保留 2 类关键动效。

### 8.1 Ambient Motion

背景动效：

- 节点缓慢呼吸
- 流线低频脉冲
- 数据薄雾微移动

节奏：

- 周期 `6s - 14s`
- ease-in-out
- 极低位移

### 8.2 Interaction Motion

交互动效：

- 输入框 focus glow
- 按钮 hover 能量扫光
- 卡片入场轻微上浮 + opacity

时长：

- `180ms - 280ms`

### 8.3 Reduced Motion

必须支持：

- `prefers-reduced-motion`

降级后：

- 背景停止脉冲
- 按钮取消扫光
- 仅保留透明度变化

---

## 9. Responsive Rules

### 9.1 Tablet

在 `768px - 1180px`：

- 改为上下布局
- 视觉区在上，登录卡在下
- 左侧浮动数据卡减少为 2 个

### 9.2 Mobile

在 `< 768px`：

- 背景仍保留，但图谱简化
- 只显示一个主视觉标题
- 登录卡全宽，左右边距 `16px`
- 隐藏大多数装饰性数据模块
- CTA 始终放在拇指舒适区

移动端要像：

- 一个高级研究终端的紧凑入口

而不是：

- 把桌面页硬挤成单列

---

## 10. Accessibility Rules

必须遵循技能建议：

- 每个输入都必须有显式 label
- 不能只靠 placeholder 表意
- 焦点态清晰可见
- 文本对比度达到 4.5:1
- 动效遵守 `prefers-reduced-motion`

补充要求：

- 背景图层不能影响表单识别
- 所有装饰线条在表单区域后退一层
- 登录失败状态要高对比，不只用红色

错误提示建议：

- 图标 + 标题 + 简短原因
- 示例：
  - `Authentication failed`
  - `Check your email, password, or organization key.`

---

## 11. Suggested Hero Copy

### Option A

- Eyebrow: `SECURE RESEARCH ACCESS`
- Heading: `Enter the Research Grid`
- Body: `A private command center for papers, feeds, notes and agent workflows.`

### Option B

- Eyebrow: `PERSONAL DATABASE NODE`
- Heading: `Your Research Network, Isolated and Live`
- Body: `Sign in to access your own paper database, synchronized feeds and AI-assisted research workspace.`

### Option C

- Eyebrow: `GRID-LEVEL INTELLIGENCE`
- Heading: `Authenticate Into the Lab Control Layer`
- Body: `A high-fidelity workspace for academic tracking, private knowledge flows and structured research automation.`

推荐使用：

- Heading 用 A
- Body 用 B

---

## 12. Page Wireframe

```text
┌──────────────────────────────────────────────────────────────────────┐
│  left visual zone                                  right login zone │
│                                                                      │
│  SECURE RESEARCH ACCESS                    [logo]      [NODE SECURED]│
│  Enter the Research Grid                                           │
│  Your research network, isolated and live.                         │
│                                                                     │
│   [floating chip]    [graph motif]       ┌───────────────────────┐   │
│   1,284 papers       power-grid lines    │  Welcome Back         │   │
│   indexed                                 │  Access your private  │   │
│                                           │  research database    │   │
│   [floating chip]                         │                       │   │
│   42 feeds                                │  Email / Username     │   │
│   synchronized                            │  Password             │   │
│                                           │  Remember device      │   │
│   [floating chip]                         │  [ Enter Workspace ]  │   │
│   personal vault                          │  Forgot password      │   │
│   isolated                                │                       │   │
│                                           │  private db isolated  │   │
│                                           └───────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 13. Implementation Guidance For This Repo

若后续在当前前端中实现，建议：

- 新增独立路由：`/login`
- 登录页不要复用当前应用主框架中的 `Sidebar + TabBar`
- 单独创建：
  - `frontend/src/pages/LoginPage.jsx`
  - `frontend/src/components/auth/LoginForm.jsx`
  - `frontend/src/components/auth/LoginAmbientScene.jsx`
  - `frontend/src/styles/login.css`

同时建议新增一组页面级变量：

```css
--login-bg-1: #07111F;
--login-bg-2: #0A1A2F;
--login-cyan: #63D1FF;
--login-blue: #2F7BFF;
--login-mint: #62F5C2;
--login-gold: #F7C86B;
--login-text: #EAF4FF;
--login-muted: #9FB6CE;
--login-glass: rgba(9, 22, 39, 0.56);
```

不要直接复用全局浅色后台布局变量作为登录页主视觉变量。

---

## 14. Final Design Decision

本页最终风格定义为：

**“Academic Grid FUI”**

即：

- 学术平台的可信结构
- 电网拓扑的能量流视觉
- 科幻控制台的精密细节
- 玻璃卡片的现代层次

如果实现时只能保留 3 个最关键特征，优先级如下：

1. 深海蓝科研控制台背景
2. 带辉光的玻璃登录卡片
3. 电网/知识图谱式动态线网视觉
