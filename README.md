# 在线笔记系统使用说明

这是一个前后端分离的笔记管理系统，包含普通用户的笔记、分类、收藏、最近编辑、统计和个人中心功能，也保留了后端 Swagger / OpenAPI 便于调试接口。

项目由两部分组成：

- `web-backend-master/`：Spring Boot 3 后端，提供登录注册、笔记、分类、收藏、统计和 AI 辅助接口。
- `web-frontend-master/`：Umi / React / Ant Design Pro 前端，提供浏览器中的完整笔记使用界面。

## 快速开始

### 1. 准备环境

请先确认本机已经安装：

- JDK 17
- MySQL 8，或兼容的 MySQL 5.7+
- Node.js
- pnpm

Windows PowerShell 下可以用这些命令简单确认：

```powershell
java -version
mysql --version
node -v
pnpm -v
```

### 2. 初始化数据库

默认数据库名是 `notebook_db`。先在 MySQL 中创建数据库：

```sql
CREATE DATABASE notebook_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

然后依次执行以下 SQL 文件：

```text
web-backend-master/src/main/resources/schema.sql
web-backend-master/src/main/resources/seed.sql
```

`schema.sql` 用于建表，`seed.sql` 用于插入初始管理员、测试用户、分类和笔记数据。重新执行 `schema.sql` 会删除并重建相关表，请不要在已有重要数据时直接执行。

### 3. 启动后端

在一个 PowerShell 终端中运行：

```powershell
cd C:\Users\18654\Desktop\SDU\Open-Innovation\main\web-backend-master
$env:DB_PASSWORD = "Root@123456"
.\gradlew bootRun
```

如果你的 MySQL 用户名、地址或数据库名不是默认值，可以额外设置：

```powershell
$env:DB_USERNAME = "root"
$env:DB_URL = "jdbc:mysql://127.0.0.1:3306/notebook_db?useUnicode=true&characterEncoding=utf-8&serverTimezone=GMT%2B8&useSSL=false&zeroDateTimeBehavior=convertToNull"
```

后端默认端口是 `9311`。启动成功后可以打开：

- 后端接口文档：<http://127.0.0.1:9311/swagger-ui/index.html>
- OpenAPI JSON：<http://127.0.0.1:9311/v3/api-docs>

### 4. 启动前端

再打开一个 PowerShell 终端运行：

```powershell
cd C:\Users\18654\Desktop\SDU\Open-Innovation\main\web-frontend-master
pnpm install
pnpm start
```

前端开发服务器通常会运行在 <http://localhost:8000>，以终端实际输出为准。

开发环境会把 `/api/` 请求代理到后端，默认目标是 <http://localhost:9311>。如果后端地址不同，启动前设置：

```powershell
$env:BACKEND_PROXY_TARGET = "http://127.0.0.1:9311"
pnpm start
```

## 第一次使用

1. 打开 <http://localhost:8000/notebook/login>。
2. 没有账号时点击“立即注册”。
3. 填写用户名、密码并同意协议后完成注册。
4. 注册成功后会自动登录并进入笔记管理页。
5. 后续登录时可以勾选“记住密码”，系统会在当前浏览器本机回填账号密码。公共电脑不建议勾选。

用户名过长时，侧边栏会自动缩小或省略显示，不影响实际账号。

## 功能导览

### 笔记管理

这是系统的核心页面。

- 点击“新建笔记”创建笔记。
- 标题输入框带有背景和边框，表示可以直接修改。
- 正文支持富文本编辑，包括字体、字号、加粗、斜体、下划线、标题、正文和对齐方式。
- 点击“保存笔记”会把标题、正文、富文本格式、分类和收藏状态同步到后端。
- 可以使用“摘要”和“翻译”功能；这些功能是否可用取决于后端 AI 配置。
- 如果当前没有笔记，右侧只显示“笔记管理”标题，避免出现不可编辑的空编辑器。

### 分类管理

分类用于给笔记建立归档关系。

- 可以新建分类。
- 可以修改分类名称。
- 可以把笔记加入分类，也可以从分类中移出。
- 一个笔记可以属于多个分类。
- 分类列表支持搜索和排序。

### 数据统计

统计页用于查看笔记使用情况。

- 支持按“近 7 天”“近 30 天”“全部”切换统计范围。
- 可以刷新后端数据。
- 展示范围内笔记数、分类数、未分类笔记、收藏笔记等指标。
- 展示分类笔记数量、关联分类情况和分类明细。

### 收藏笔记

收藏页用于集中查看已收藏的笔记。

- 可以搜索收藏笔记。
- 可以查看笔记详情。
- 富文本笔记会尽量保持和正文编辑器一致的格式。
- 可以取消收藏，取消后该笔记会从收藏列表移除。

### 最近编辑

最近编辑页按更新时间展示笔记。

- 可以搜索最近编辑的笔记。
- 可以查看最近两次保存差异。
- 支持恢复到上一次保存版本。
- 富文本内容会优先拉取详情接口，尽量保持原格式显示。

### 个人中心

个人中心用于账号维护。

- 可以修改用户名。
- 可以修改密码。
- 修改用户名后本地笔记缓存会迁移到新用户名下。

### 系统设置

侧边栏中的“系统设置”可以调整：

- 浅色 / 深色主题。
- 字体大小。
- 新笔记默认分类。
- 列表默认排序。
- 自动保存间隔。

自动保存不是装饰功能。选择 `30 秒`、`1 分钟` 或 `5 分钟` 后，如果编辑器内容发生变化，系统会按间隔调用保存接口；没有改动时不会重复保存。

## AI 功能配置

后端默认关闭 AI 功能。需要摘要、翻译或音频转写时，在启动后端前设置环境变量：

```powershell
$env:NOTEBOOK_AI_ENABLED = "true"
$env:NOTEBOOK_AI_PROVIDER = "deepseek"
$env:NOTEBOOK_AI_BASE_URL = "你的AI服务地址"
$env:NOTEBOOK_AI_API_KEY = "你的API Key"
$env:NOTEBOOK_AI_TRANSLATION_MODEL = "翻译模型名"
$env:NOTEBOOK_AI_SUMMARY_MODEL = "摘要模型名"
$env:NOTEBOOK_AI_TRANSCRIPTION_MODEL = "转写模型名"
```

没有配置 AI 时，普通笔记、分类、收藏、统计、注册登录等功能仍可正常使用。

## 常用开发命令

后端：

```powershell
cd web-backend-master
.\gradlew bootRun
.\gradlew test
```

前端：

```powershell
cd web-frontend-master
pnpm install
pnpm start
pnpm tsc
pnpm lint
pnpm build
```

## 重新生成前端 API 客户端

前端使用 `@umijs/max` 的 OpenAPI 能力生成 `src/services/api` 下的接口代码。只有后端接口发生变化时才需要执行。

确保后端已经启动后运行：

```powershell
cd web-frontend-master
$env:OPENAPI_SCHEMA = "http://127.0.0.1:9311/v3/api-docs"
pnpm openapi
```

注意：`src/services/api/authentication.ts`、`src/services/api/notebook.ts` 和部分类型文件包含手工封装。执行 `pnpm openapi` 后如果这些文件被覆盖，需要从版本库恢复或重新合并手工逻辑。

## 目录说明

`web-backend-master/`

- `src/main/java/`：后端 Java 源码。
- `src/main/resources/application.properties`：后端端口、数据库、AI 环境变量配置。
- `src/main/resources/schema.sql`：数据库建表脚本。
- `src/main/resources/seed.sql`：初始数据脚本。
- `build.gradle`：Gradle 依赖和构建配置。

`web-frontend-master/`

- `src/pages/notebook/`：笔记系统主要页面。
- `src/services/api/`：前端 API 调用封装。
- `config/proxy.ts`：开发代理配置。
- `package.json`：前端脚本和依赖。

## 常见问题

### MySQL 报 `Access denied ... using password: NO`

后端没有读到数据库密码。启动后端前设置：

```powershell
$env:DB_PASSWORD = "你的MySQL密码"
```

### 前端页面打开了，但请求接口失败

确认后端已经在 `9311` 端口运行，并检查前端代理目标：

```powershell
$env:BACKEND_PROXY_TARGET = "http://127.0.0.1:9311"
pnpm start
```

### 注册成功后没有进入系统

确认后端登录接口正常，浏览器开发者工具中查看 `/api/notebook/auth/login` 请求是否成功。注册成功后系统会自动调用登录接口，如果登录失败，会提示回到登录页手动登录。

### 自动保存没有触发

确认已经在“系统设置”里把自动保存间隔从“关闭”改为 `30 秒`、`1 分钟` 或 `5 分钟`。自动保存只在内容发生变化后触发。

### 摘要或翻译不可用

确认后端已启用 AI 配置，尤其是 `NOTEBOOK_AI_ENABLED`、`NOTEBOOK_AI_BASE_URL`、`NOTEBOOK_AI_API_KEY` 和模型名。

## 适合的启动顺序

1. 启动 MySQL。
2. 初始化 `notebook_db`。
3. 启动后端 `.\gradlew bootRun`。
4. 启动前端 `pnpm start`。
5. 浏览器打开 <http://localhost:8000/notebook/login>。
