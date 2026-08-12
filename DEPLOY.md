# 价值投资分析器 - 多端部署指南

## 架构概览

```
┌──────────────────────────────────────────────────┐
│                 PWA 应用                          │
│   网页 / 桌面安装 / 手机安装（同一套代码）         │
│                                                  │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │  浏览器   │  │  桌面APP │  │  手机APP  │      │
│   └─────┬────┘  └─────┬────┘  └─────┬────┘      │
│         └─────────────┼─────────────┘            │
│                       │                          │
│          ┌────────────┴────────────┐             │
│          │   Supabase (云端)        │             │
│          │   - 用户认证             │             │
│          │   - 数据存储             │             │
│          │   - 实时同步             │             │
│          └─────────────────────────┘             │
└──────────────────────────────────────────────────┘
          │
          ▼
   ┌──────────────┐
   │  行情代理服务  │  (东方财富/腾讯 API)
   │  Node.js      │
   └──────────────┘
```



---

## 第一步：创建 Supabase 项目

1. 访问 <https://supabase.com> 注册账号
2. 点击 **New Project**，填写项目名称（如 `stock-valuation`）
3. 设置数据库密码，选择区域（推荐 Southeast Asia / Singapore）
4. 等待项目创建完成（约 2 分钟）

### 获取 API 密钥

1. 进入项目 Dashboard
2. 左侧菜单 **Settings** → **API**
3. 记下以下两个值：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOi...`（很长的字符串）

### 创建数据库表

1. 左侧菜单 **SQL Editor**
2. 点击 **New query**
3. 将 `schema.sql` 文件内容粘贴进去
4. 点击 **Run** 执行
5. 确认出现 `Success` 提示

---

## 第二步：配置应用

编辑 `supabase-config.js`，替换为你自己的项目信息：

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';           // 替换
const SUPABASE_ANON_KEY = 'eyJhbGciOi...你的anon key...';   // 替换
```

保存后刷新页面，右上角应出现"登录/注册"按钮。

---

## 第三步：部署到云端

### 方案 A：Vercel 部署（推荐，免费）

1. 将 `stock-valuation-app` 文件夹上传到 GitHub 仓库
2. 访问 <https://vercel.com> 注册
3. **New Project** → 选择仓库
4. 部署配置：
   - Framework Preset: Other
   - Root Directory: `stock-valuation-app`
   - 不需要 Build Command
5. 需要将 `server.js` 转为 Vercel Serverless Functions

创建 `api/` 文件夹，将后端 API 拆分为 serverless 函数：

```
stock-valuation-app/
├── api/
│   ├── quote.js      → /api/quote/:code
│   ├── finance.js    → /api/finance/:code
│   └── history.js    → /api/history/:code
├── index.html
├── styles.css
├── app.js
├── ...
└── vercel.json
```

`vercel.json` 配置：

```json
{
  "rewrites": [
    { "source": "/api/quote/:code", "destination": "/api/quote.js" },
    { "source": "/api/finance/:code", "destination": "/api/finance.js" },
    { "source": "/api/history/:code", "destination": "/api/history.js" }
  ]
}
```

### 方案 B： Railway 部署（保留 Express 服务器）

1. 访问 <https://railway.app>
2. **New Project** → 从 GitHub 部署
3. 选择仓库，Railway 自动检测 Node.js
4. 设置端口为 `8090`
5. 部署完成即可通过 `https://xxx.railway.app` 访问

### 方案 C：本地运行（开发用）

```bash
cd stock-valuation-app
node server.js
```

访问 <http://localhost:8090>

> ⚠️ PWA 安装功能需要 HTTPS。本地 localhost 视为安全来源，可正常安装。  
> 部署到外网时必须使用 HTTPS（Vercel/Railway 默认提供 HTTPS）。

---

## 第四步：多端安装

### 桌面安装（Windows/Mac）

1. 在 Chrome 或 Edge 浏览器中打开应用
2. 地址栏右侧会出现安装图标
3. 或点击页面底部出现的"安装"提示
4. 安装后可在桌面/开始菜单找到应用图标

### 手机安装（Android）

1. 在 Chrome 中打开应用 URL
2. 菜单 → **添加到主屏幕** 或 **安装应用**
3. 安装后从主屏幕启动，全屏运行

### 手机安装（iOS）

1. 在 Safari 中打开应用 URL
2. 分享按钮 → **添加到主屏幕**
3. 从主屏幕启动，全屏运行
4. ⚠️ iOS 的 PWA 支持有限制：无后台推送、存储配额较小

---

## 第五步（后续）：微信登录

当前版本使用邮箱密码认证。要添加微信扫码登录：

### 前置条件

1. 注册 [微信开放平台](https://open.weixin.qq.com) 账号
2. 完成**企业认证**（需营业执照，个人开发者暂不支持网站应用）
3. 创建**网站应用**，获取独立的 AppID 和 AppSecret
4. 设置授权回调域名（如 `your-domain.vercel.app`）

> ⚠️ 微信开放平台的 AppID 与公众号 AppID **不同**，不能混用。

### 实现方式

在 Supabase 中使用自定义 OAuth Provider：

1. 创建一个 Supabase Edge Function 处理微信 OAuth 回调
2. 用 Supabase 的 `auth.signInWithIdToken` 或自定义 token 签名
3. 前端添加"微信登录"按钮，跳转到微信授权页面

---

## 数据同步机制

| 场景     | 行为                               |
| ------ | -------------------------------- |
| 登录时    | 从云端拉取自选股，与本地合并（取最新）              |
| 保存自选股  | 写入 localStorage + 防抖推送云端（1.5秒延迟） |
| 删除自选股  | 本地删除 + 云端删除                      |
| 刷新价格   | 批量更新本地 + 批量推送云端                  |
| 其他设备修改 | 实时订阅自动更新本地列表                     |
| 离线使用   | 正常使用，数据存 localStorage            |
| 网络恢复   | 自动拉取 + 推送同步                      |

---

## 常见问题

**Q: 不配置 Supabase 能用吗？**  
A: 能。应用完全可用，自选股存在浏览器本地（localStorage），只是不能跨设备同步。右上角不显示登录按钮。

**Q: Supabase 免费额度够用吗？**  
A: 个人使用完全够。免费版 500MB 数据库、50000 月活用户、无限 API 请求。

**Q: 国内访问 Supabase 速度如何？**  
A: 选择 Singapore 区域，国内访问延迟约 100-200ms，日常使用无明显感知。如需更快可切换到腾讯云开发 CloudBase。

**Q: iOS 上 PWA 有限制吗？**  
A: iOS Safari 的 PWA 支持不如 Android 完善：无后台推送通知、localStorage 有 50MB 限制（已登录后主要数据在云端，影响不大）。
