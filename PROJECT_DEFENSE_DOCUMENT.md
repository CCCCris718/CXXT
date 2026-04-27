# 在线笔记系统项目结构与功能说明

本文档用于项目答辩时介绍“在线笔记系统”的整体结构、技术架构、核心功能、数据库设计和演示思路。项目采用前后端分离架构，前端负责浏览器端交互体验，后端负责用户认证、笔记数据、分类数据、统计数据和 AI 能力封装。

## 一、项目概述

本项目是一个面向个人学习和日常记录场景的在线笔记管理系统。用户可以注册账号、登录系统，并在网页中完成笔记创建、编辑、分类、收藏、最近编辑查看、数据统计和个人账号管理。系统还预留并实现了 AI 摘要、翻译和音频转写接口，其中摘要和翻译可通过 DeepSeek 兼容的对话接口接入。

项目根目录主要包含两个子项目：

```text
main/
├── README.md                         # 项目启动、功能和常见问题说明
├── FRAMEWORK_CHANGES.md              # 前端框架依赖与类型检查修复记录
├── PROJECT_DEFENSE_DOCUMENT.md       # 答辩用项目结构与功能说明
├── web-backend-master/               # Spring Boot 后端项目
└── web-frontend-master/              # Umi + React 前端项目
```

系统的核心目标包括：

- 提供完整的笔记管理闭环：新增、编辑、保存、删除、搜索、分类、收藏。
- 支持富文本笔记：正文支持字体、字号、加粗、斜体、下划线、标题、正文和对齐方式。
- 支持账号隔离：每个用户只能访问自己的笔记和分类。
- 支持数据统计：展示笔记数量、分类数量、未分类笔记、收藏笔记和分类分布。
- 支持 AI 辅助：可对笔记内容进行摘要、翻译，并预留音频转写能力。
- 保留 OpenAPI / Swagger：方便调试后端接口，也方便前端自动生成 API 客户端。

## 二、技术架构

### 1. 总体架构

系统采用典型的 Browser / Frontend / Backend / Database 四层结构：

```text
浏览器
  ↓
Umi / React / Ant Design Pro 前端
  ↓  通过 /api/ 代理请求
Spring Boot 3 后端
  ↓
MySQL 数据库
  ↓
可选 AI 服务（DeepSeek 兼容接口）
```

前端运行在本地开发服务器，默认地址为 `http://localhost:8000`。开发环境下，前端把 `/api/` 请求代理到后端，默认后端地址为 `http://localhost:9311`。后端连接 MySQL 数据库 `notebook_db`，并通过环境变量控制数据库账号、密码和 AI 服务配置。

### 2. 前端技术栈

前端位于 `web-frontend-master/`，主要技术如下：

- `React 18`：负责组件化页面开发。
- `Umi / @umijs/max`：负责路由、构建、开发服务器、初始状态和请求封装。
- `Ant Design / Ant Design Pro`：负责页面基础 UI、表单、弹窗和布局能力。
- `TypeScript`：提升代码可维护性和类型安全。
- `DOMPurify`：对富文本 HTML 做安全过滤，减少 XSS 风险。
- `localStorage`：保存用户本地设置、笔记缓存和最近两次保存快照。
- `OpenAPI`：根据后端接口生成 `src/services/api` 下的接口调用代码。

### 3. 后端技术栈

后端位于 `web-backend-master/`，主要技术如下：

- `Spring Boot 3.2`：提供 Web 服务和项目启动入口。
- `Java 17`：后端运行和编译版本。
- `MyBatis / MyBatis-Plus`：负责数据库访问和基础 CRUD。
- `MySQL`：保存用户、笔记、分类、笔记分类关系、管理员和登录日志数据。
- `Spring AOP`：通过切面统一检查接口登录态和权限。
- `Springdoc OpenAPI`：生成 Swagger UI 和 OpenAPI JSON。
- `Lombok`：简化实体和 DTO 代码。
- `Jsoup`：配合富文本处理，清洗和保留安全 HTML。
- `Java HttpClient`：调用外部 AI 服务。

## 三、前端项目结构

`web-frontend-master/` 是浏览器端项目，目录结构可以概括为：

```text
web-frontend-master/
├── config/
│   ├── config.ts                     # Umi 主配置，包含路由、代理、OpenAPI、插件配置
│   ├── routes.ts                     # 前端路由配置
│   ├── proxy.ts                      # 开发环境 /api/ 代理到后端
│   └── defaultSettings.ts            # Ant Design Pro 默认布局设置
├── src/
│   ├── app.tsx                       # 全局初始状态、登录态拉取、路由守卫
│   ├── constants/
│   │   └── auth.ts                   # 登录路径等认证常量
│   ├── pages/
│   │   └── notebook/                 # 在线笔记系统主要页面
│   │       ├── login/                # 登录页
│   │       ├── register/             # 注册页
│   │       ├── note/                 # 笔记管理页和本地缓存逻辑
│   │       ├── category/             # 分类管理页
│   │       ├── statistics/           # 数据统计页
│   │       ├── favorites/            # 收藏笔记页
│   │       ├── recent/               # 最近编辑页
│   │       ├── profile/              # 个人中心页
│   │       └── components/           # 笔记工作台公共布局组件
│   ├── services/
│   │   └── api/                      # OpenAPI 生成接口和手写门面封装
│   └── utils/                        # 请求、文件、用户显示名等工具函数
├── package.json                      # 前端依赖和脚本
├── tsconfig.json                     # TypeScript 配置
└── pnpm-lock.yaml                    # pnpm 锁定依赖版本
```

### 1. 路由结构

前端路由集中在 `config/routes.ts`。系统的主要访问路径如下：

```text
/notebook/login        登录页
/notebook/register     注册页
/notebook/note         笔记管理
/notebook/category     分类管理
/notebook/statistics   数据统计
/notebook/favorites    收藏笔记
/notebook/recent       最近编辑
/notebook/profile      个人中心
```

旧的 `/user/login` 会重定向到 `/notebook/login`，`/` 会重定向到 `/notebook/note`。

### 2. 公共工作台布局

`src/pages/notebook/components/NotebookWorkspace.tsx` 是笔记系统的公共工作台布局。它负责：

- 左侧展示系统名称、当前用户、身份和登录状态。
- 提供功能导航：笔记管理、分类管理、数据统计、收藏笔记、最近编辑、个人中心。
- 提供系统设置入口：主题、字体大小、默认分类、默认排序、自动保存间隔。
- 提供退出登录入口。
- 通过统一布局保证各功能页视觉一致。

### 3. 前端 API 调用

前端接口主要集中在 `src/services/api/`：

- `notebookAuth.ts`：登录、注册、当前用户、修改用户名、修改密码等。
- `notebookNote.ts`：笔记列表、详情、新增、更新、删除等。
- `notebookCategory.ts`：分类列表、新增、更新、删除等。
- `notebookAi.ts`：摘要、翻译、转写等 AI 接口。
- `notebookStatistics.ts`：分类统计接口。
- `notebook.ts`：手写门面文件，统一封装页面常用调用方式。
- `authentication.ts`：兼容页面登录态使用的认证门面。

前端请求通过 `@umijs/max` 的 request 能力发起，开发时由 `config/proxy.ts` 把 `/api/` 转发到后端。

## 四、后端项目结构

`web-backend-master/` 是 Spring Boot 后端项目，目录结构可以概括为：

```text
web-backend-master/
├── build.gradle                      # Gradle 构建配置和后端依赖
├── gradlew / gradlew.bat             # Gradle Wrapper
├── src/
│   ├── main/
│   │   ├── java/redlib/backend/
│   │   │   ├── WebBackendApplication.java     # Spring Boot 启动类
│   │   │   ├── annotation/                    # 权限与模块注解
│   │   │   ├── config/                        # Web、OpenAPI、Token、AI、Schema 迁移配置
│   │   │   ├── controller/                    # HTTP 接口层
│   │   │   ├── dao/                           # 管理端旧模块 Mapper
│   │   │   ├── dto/                           # 请求参数对象
│   │   │   ├── mapper/                        # 笔记系统 MyBatis Mapper
│   │   │   ├── model/                         # 数据库实体和通用模型
│   │   │   ├── service/                       # 业务接口、实现、AI provider
│   │   │   ├── utils/                         # 安全、格式化、富文本、分页工具
│   │   │   └── vo/                            # 返回给前端的视图对象
│   │   └── resources/
│   │       ├── application.properties         # 端口、数据库、AI 配置
│   │       ├── schema.sql                     # 数据库建表脚本
│   │       ├── seed.sql                       # 初始数据脚本
│   │       ├── manual-mysql-migration.sql     # 手工迁移脚本
│   │       └── mapper/                        # 部分 XML Mapper
│   └── test/
│       ├── java/redlib/backend/               # 后端接口和服务测试
│       └── resources/                         # 测试环境配置和 H2 测试数据
└── lib/                                       # MyBatis Generator 相关 jar
```

### 1. Controller 接口层

后端主要 Controller 如下：

- `NotebookAuthController`：普通用户登录、注册、当前用户、修改用户名、验证密码、修改密码、退出登录。
- `NotebookNoteController`：笔记列表、详情、新增、更新、收藏状态更新、删除。
- `NotebookCategoryController`：分类列表、新增、更新、删除。
- `NotebookStatisticsController`：按用户统计分类笔记数量。
- `NotebookAiController`：笔记摘要、翻译、音频转写。
- `AuthenticationController`、`AdminController`、`DepartmentController`、`LoginLogController`、`OnlineUserController`：保留的后台管理和登录日志相关接口。

### 2. Service 业务层

核心业务逻辑位于 `service/impl/`：

- `NotebookAuthServiceImpl`：校验用户名和密码，注册账号，生成 Token，修改用户名和密码。
- `NotebookNoteServiceImpl`：按当前用户查询笔记，保存富文本和纯文本，维护分类关系，更新收藏状态，防止跨用户访问。
- `NotebookCategoryServiceImpl`：管理当前用户的分类数据。
- `NotebookStatisticsServiceImpl`：根据当前用户统计分类维度数据。
- `NotebookAiFacadeServiceImpl`：统一处理摘要、翻译、转写请求，支持传入文本或根据笔记 ID 读取正文。
- `TranslationServiceImpl`、`SummaryServiceImpl`、`SpeechToTextServiceImpl`：分别封装 AI 翻译、摘要和转写能力。
- `TokenServiceImpl`：签发、保存和注销登录 Token。

### 3. 数据访问层

笔记系统的数据访问主要通过 `mapper/` 下的接口完成：

- `NotebookUserMapper`：用户数据。
- `NotebookNoteMapper`：笔记数据、分页和关键字查询。
- `NotebookCategoryMapper`：分类数据、分类统计、按笔记查询分类。
- `NotebookNoteCategoryMapper`：笔记和分类的多对多关系。

系统同时保留 `dao/` 和 `resources/mapper/` 下的管理端相关 Mapper，用于管理员、部门和登录日志等历史模块。

## 五、核心功能说明

### 1. 注册与登录

注册流程：

1. 用户打开 `/notebook/register`。
2. 输入用户名、密码、确认密码，并同意用户协议和隐私政策。
3. 前端调用 `/api/notebook/auth/register`。
4. 后端校验用户名格式、密码长度、两次密码一致性和用户名唯一性。
5. 注册成功后，前端可自动登录并进入笔记管理页。

登录流程：

1. 用户打开 `/notebook/login`。
2. 输入用户名和密码。
3. 前端调用 `/api/notebook/auth/login`。
4. 后端校验账号密码，生成 Token，并把 `accessToken` 写入 HttpOnly Cookie。
5. 前端保存当前登录态，进入 `/notebook/note`。

后端使用 `TokenCheckAspect` 对 Controller 接口做统一登录态检查。除登录、注册等标记为无需权限的接口外，其他接口都必须有有效 Token。

### 2. 笔记管理

笔记管理是系统核心功能，路径为 `/notebook/note`。主要能力包括：

- 新建笔记：生成新笔记并支持设置默认分类。
- 编辑标题：标题输入框可直接修改。
- 编辑正文：支持富文本编辑，包含字体、字号、加粗、斜体、下划线、标题/正文切换和对齐方式。
- 保存笔记：前端调用后端新增或更新接口，同时记录本地最近两次保存快照。
- 删除笔记：调用后端删除接口，并同步本地缓存。
- 搜索笔记：按标题和正文进行过滤。
- 分类过滤：可按“全部”“未分类”或具体分类查看笔记。
- 收藏笔记：单独调用收藏状态接口，收藏状态会落库。
- 自动保存：在系统设置中选择 30 秒、1 分钟或 5 分钟后，内容变化时自动调用保存逻辑。
- AI 摘要和翻译：调用后端 AI 接口，对当前正文进行摘要或翻译。

富文本保存时，前端会清洗 HTML，后端也会通过 `NotebookRichTextUtils` 进行安全处理，并同时保存：

- `content`：纯文本内容，用于搜索、列表展示和 AI 输入。
- `rich_content`：富文本 HTML，用于恢复编辑器格式。

### 3. 分类管理

分类管理路径为 `/notebook/category`。主要能力包括：

- 新建分类。
- 修改分类名称。
- 删除分类。
- 搜索分类。
- 按分类笔记数量或名称排序。
- 查看某个分类下的笔记。
- 把已有笔记加入当前分类。
- 从当前分类移除笔记。

数据库中笔记和分类是多对多关系，一条笔记可以属于多个分类，通过 `note_category` 表维护关联。

### 4. 数据统计

数据统计路径为 `/notebook/statistics`。主要能力包括：

- 支持切换统计范围：近 7 天、近 30 天、全部。
- 展示范围内笔记数量。
- 展示有笔记的分类数量和空分类数量。
- 展示未分类笔记数量及占比。
- 展示收藏笔记数量及占比。
- 展示各分类笔记数量柱状图。
- 展示笔记关联分类情况，包括单分类、多分类和未分类。
- 提供刷新按钮，从后端重新拉取最新数据。

前端会结合后端返回的分类和笔记数据计算展示指标，后端也提供 `categoryCounts` 接口用于分类维度统计。

### 5. 收藏笔记

收藏笔记路径为 `/notebook/favorites`。主要能力包括：

- 集中展示已收藏笔记。
- 支持搜索收藏笔记。
- 选择收藏笔记后查看详情。
- 富文本笔记优先展示富文本格式。
- 可取消收藏，取消后调用后端接口同步状态。

### 6. 最近编辑

最近编辑路径为 `/notebook/recent`。主要能力包括：

- 按更新时间倒序展示笔记。
- 支持搜索最近编辑笔记。
- 展示最近两次保存差异。
- 支持把笔记恢复到上一次保存版本。
- 详情展示时会优先拉取后端富文本内容，保证格式尽量一致。

最近编辑中的差异对比主要基于前端 `localStorage` 保存的最近两次快照，不依赖额外数据库表。

### 7. 个人中心

个人中心路径为 `/notebook/profile`。主要能力包括：

- 查看当前用户名。
- 修改用户名。
- 修改密码。

修改用户名时，后端要求输入当前密码，并限制用户名每 30 天只能修改一次。前端在用户名修改成功后，会迁移该用户在本地 `localStorage` 中的笔记缓存和保存历史，避免因为登录名变化导致本地数据找不到。

### 8. 系统设置

系统设置入口位于左侧导航栏。主要能力包括：

- 主题切换：浅色 / 深色。
- 字体大小：小 / 中 / 大。
- 新笔记默认分类。
- 列表默认排序。
- 自动保存间隔。

这些设置主要保存在浏览器 `localStorage` 中，用于提升个人使用体验。

### 9. AI 辅助功能

AI 接口路径为 `/api/notebook/ai`：

- `translate`：翻译文本或指定笔记内容。
- `summarize`：摘要文本或指定笔记内容。
- `transcribe`：上传音频并转写文本，具体能力取决于配置的 provider。

后端通过 `NotebookAiFacadeServiceImpl` 做统一入口，再委托给翻译、摘要、转写服务。当前 `DeepSeekAiProvider` 已实现摘要和翻译，调用方式是向 DeepSeek 兼容的 `/v1/chat/completions` 发送请求。

AI 功能默认关闭，需要通过环境变量启用：

```powershell
$env:NOTEBOOK_AI_ENABLED = "true"
$env:NOTEBOOK_AI_PROVIDER = "deepseek"
$env:NOTEBOOK_AI_BASE_URL = "你的AI服务地址"
$env:NOTEBOOK_AI_API_KEY = "你的API Key"
$env:NOTEBOOK_AI_TRANSLATION_MODEL = "翻译模型名"
$env:NOTEBOOK_AI_SUMMARY_MODEL = "摘要模型名"
```

未配置 AI 时，普通笔记、分类、收藏、统计和账号功能仍然可以正常使用。

## 六、数据库设计

数据库默认名称为 `notebook_db`，建表脚本位于 `web-backend-master/src/main/resources/schema.sql`。

### 1. 核心业务表

```text
notebook_user
├── id                       用户主键
├── username                 登录用户名，唯一
├── password                 加密后的密码
├── enabled                  是否启用
├── created_at / updated_at  创建和更新时间
└── username_last_changed_at 用户名上次修改时间

note
├── id                       笔记主键
├── user_id                  所属用户
├── title                    笔记标题
├── content                  纯文本正文
├── rich_content             富文本 HTML
├── favorite                 是否收藏
└── created_at / updated_at  创建和更新时间

category
├── id                       分类主键
├── user_id                  所属用户
├── name                     分类名称
└── created_at / updated_at  创建和更新时间

note_category
├── id                       关系主键
├── note_id                  笔记 ID
└── category_id              分类 ID
```

### 2. 表关系

```text
notebook_user 1 ─── N note
notebook_user 1 ─── N category
note          N ─── N category
```

说明：

- 一个用户可以拥有多条笔记。
- 一个用户可以拥有多个分类。
- 一条笔记可以绑定多个分类。
- 一个分类可以包含多条笔记。
- `note_category` 负责维护笔记和分类之间的多对多关系。

### 3. 管理端和日志表

项目还保留了后台管理相关表：

- `admin`：管理员账号。
- `admin_priv`：管理员权限。
- `login_log`：登录日志。

这些表主要服务于原有管理端模块和接口调试，不是普通用户笔记功能的主线。

## 七、接口设计概览

后端接口统一以 `/api/` 开头，笔记系统接口集中在 `/api/notebook/` 下。

### 1. 认证接口

```text
POST /api/notebook/auth/register                注册
POST /api/notebook/auth/login                   登录
GET  /api/notebook/auth/currentUser             获取当前用户
POST /api/notebook/auth/changeNotebookId        修改用户名
POST /api/notebook/auth/verifyCurrentPassword   验证当前密码
POST /api/notebook/auth/changePassword          修改密码
GET  /api/notebook/auth/logout                  退出登录
```

### 2. 笔记接口

```text
POST /api/notebook/notes/list       分页查询笔记
GET  /api/notebook/notes/get        获取笔记详情
POST /api/notebook/notes/add        新增笔记
POST /api/notebook/notes/update     更新笔记
POST /api/notebook/notes/favorite   更新收藏状态
POST /api/notebook/notes/delete     删除笔记
```

### 3. 分类接口

```text
POST /api/notebook/categories/list    查询分类
POST /api/notebook/categories/add     新增分类
POST /api/notebook/categories/update  更新分类
POST /api/notebook/categories/delete  删除分类
```

### 4. 统计和 AI 接口

```text
GET  /api/notebook/statistics/categoryCounts  分类统计
POST /api/notebook/ai/summarize               摘要
POST /api/notebook/ai/translate               翻译
POST /api/notebook/ai/transcribe              音频转写
```

接口文档可以通过 Swagger 查看：

```text
http://127.0.0.1:9311/swagger-ui/index.html
```

## 八、关键业务流程

### 1. 登录态校验流程

```text
用户登录成功
  ↓
后端生成 Token，并写入 accessToken Cookie
  ↓
前端进入系统页面
  ↓
前端启动时调用 currentUser 获取登录态
  ↓
后端 AOP 切面检查接口是否需要登录
  ↓
通过后执行业务逻辑，否则返回未登录错误
```

### 2. 笔记保存流程

```text
用户编辑标题或正文
  ↓
前端清洗富文本 HTML，提取纯文本
  ↓
调用新增或更新笔记接口
  ↓
后端校验当前用户只能操作自己的笔记
  ↓
后端保存 title / content / rich_content / favorite
  ↓
同步 note_category 分类关系
  ↓
前端刷新本地缓存并记录保存快照
```

### 3. 分类绑定流程

```text
用户选择笔记和分类
  ↓
前端把 categoryIds 放入笔记更新请求
  ↓
后端先删除该笔记旧分类关系
  ↓
校验分类是否存在且属于当前用户
  ↓
批量写入新的 note_category 关系
```

### 4. AI 摘要 / 翻译流程

```text
用户点击摘要或翻译
  ↓
前端提交文本或笔记 ID
  ↓
后端 facade 判断输入来源
  ↓
如果只传笔记 ID，则读取当前用户自己的笔记正文
  ↓
调用 SummaryService 或 TranslationService
  ↓
根据 provider 配置调用外部 AI 服务
  ↓
返回摘要或翻译结果给前端展示
```

## 九、项目亮点

### 1. 前后端分离清晰

前端只负责页面展示、交互状态和接口调用；后端负责数据持久化、权限校验、业务规则和 AI 能力封装。两端通过 `/api/` 接口通信，并可通过 OpenAPI 生成前端接口代码。

### 2. 账号级数据隔离

笔记、分类和统计都基于当前登录用户处理。后端在查询、更新和删除时都会检查 `user_id`，避免用户访问或修改他人数据。

### 3. 富文本与纯文本双存储

系统既保存富文本 HTML，保证编辑体验和展示效果；也保存纯文本，便于搜索、列表展示、摘要和翻译。前后端都对富文本进行安全处理。

### 4. 多分类关系设计

笔记和分类采用多对多关系，一条笔记可以归入多个分类，避免单分类模型限制使用场景。

### 5. 本地体验增强

前端使用 `localStorage` 保存系统设置、笔记缓存和最近两次保存快照。即使部分页面临时离线或接口失败，也能保留一定的本地展示能力。

### 6. AI 能力可插拔

AI 功能通过 provider 方式封装，当前支持 DeepSeek 兼容接口。摘要、翻译、转写都由 facade 统一入口调度，后续可以扩展其他 AI 服务。

### 7. 答辩演示完整度高

系统从注册登录、笔记编辑、分类组织、统计分析、收藏管理、历史恢复到 AI 辅助都有可演示路径，适合按“用户真实使用流程”进行答辩展示。

## 十、启动与演示步骤

### 1. 环境准备

需要安装：

```text
JDK 17
MySQL 8 或兼容 MySQL 5.7+
Node.js
pnpm
```

### 2. 初始化数据库

创建数据库：

```sql
CREATE DATABASE notebook_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

执行脚本：

```text
web-backend-master/src/main/resources/schema.sql
web-backend-master/src/main/resources/seed.sql
```

### 3. 启动后端

```powershell
cd web-backend-master
$env:DB_PASSWORD = "你的MySQL密码"
.\gradlew bootRun
```

后端默认端口为 `9311`。

### 4. 启动前端

```powershell
cd web-frontend-master
pnpm install
pnpm start
```

前端默认访问地址为：

```text
http://localhost:8000/notebook/login
```

### 5. 建议答辩演示顺序

1. 打开登录页，展示注册和登录流程。
2. 进入笔记管理页，新建一条笔记。
3. 演示富文本编辑，包括字号、加粗、标题和对齐。
4. 保存笔记，并展示列表中更新时间变化。
5. 创建分类，把笔记加入多个分类。
6. 收藏笔记，进入收藏页查看并取消收藏。
7. 修改笔记后保存，进入最近编辑页展示差异和恢复能力。
8. 进入数据统计页，展示笔记数、分类数、收藏占比和分类分布。
9. 进入个人中心，展示修改用户名和修改密码入口。
10. 如果已配置 AI，演示摘要和翻译；如果未配置，则说明 AI 功能通过环境变量按需开启。

## 十一、答辩时可重点说明的问题

### 1. 为什么使用前后端分离？

前后端分离可以让页面交互和后端业务解耦。前端专注用户体验，后端专注数据、权限和接口。后续如果要做移动端、小程序或其他客户端，也可以复用同一套后端接口。

### 2. 如何保证用户只能访问自己的数据？

用户登录后后端会生成 Token。每个笔记和分类都有 `user_id`。在查询、更新、删除笔记和分类时，后端都会读取当前 Token 中的用户 ID，并校验数据所属用户是否一致。

### 3. 为什么笔记要同时保存纯文本和富文本？

富文本用于恢复编辑器格式和详情展示；纯文本用于搜索、列表摘要、统计和 AI 处理。这样既保证用户体验，也方便后端处理数据。

### 4. 分类为什么设计成多对多？

一条笔记可能同时属于“课程学习”和“项目备忘”。如果只支持单分类，会限制使用场景。通过 `note_category` 关系表可以让笔记和分类灵活关联。

### 5. AI 功能如何扩展？

后端把 AI 能力抽象成 provider。当前 DeepSeek provider 实现了摘要和翻译。后续如果接入其他模型，只需要实现统一接口，再通过配置选择 provider。

### 6. 系统有哪些安全考虑？

系统通过 Token 和 AOP 切面做接口登录态检查；通过 `user_id` 做数据隔离；通过前后端富文本清洗降低 XSS 风险；登录 Cookie 设置了 HttpOnly，减少前端脚本直接读取 Token 的风险。

## 十二、总结

本项目实现了一个结构完整、功能闭环清晰的在线笔记系统。前端采用 Umi、React 和 Ant Design Pro 构建交互界面，后端采用 Spring Boot、MyBatis 和 MySQL 提供稳定的数据服务。系统围绕普通用户的笔记使用场景，完成了账号、笔记、分类、收藏、统计、最近编辑、个人中心和 AI 辅助等模块，具备较好的演示完整度和后续扩展空间。
