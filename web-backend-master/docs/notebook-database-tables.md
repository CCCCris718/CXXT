# 笔记模块数据库表设计（后四张表）

本文档描述 `web-backend-master/src/main/resources/schema.sql` 中与在线笔记业务直接相关的四张表：`notebook_user`、`note`、`category`、`note_category`。

> **迁移说明**：应用启动时 `NotebookSchemaMigrator` 会：若仍存在则删除 `notebook_user.display_name`；并尝试补列 `note.rich_content`、`note.favorite`、`notebook_user.username_last_changed_at`（缺列时）。

---

## 1. `notebook_user`（笔记系统用户）

**用途**：普通用户注册、登录与个人资料；与 `note`、`category` 通过 `user_id` 关联。

```sql
CREATE TABLE notebook_user (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    password VARCHAR(64) NOT NULL,
    enabled BIT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    username_last_changed_at DATETIME(3) NULL,
    UNIQUE (username)
);
```

| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| `id` | INT | PK，自增 | 用户主键 |
| `username` | VARCHAR(64) | NOT NULL，唯一 | 登录用户名 |
| `password` | VARCHAR(64) | NOT NULL | 密码（存储形态由业务层决定，一般为哈希） |
| `enabled` | BIT | 默认 1 | 是否启用 |
| `created_at` | TIMESTAMP | 默认当前时间 | 创建时间 |
| `updated_at` | TIMESTAMP | 默认当前时间 | 更新时间 |
| `username_last_changed_at` | DATETIME(3) | 可空 | 用户名最后修改时间（毫秒精度） |

**索引/约束**：`UNIQUE (username)`。

---

## 2. `note`（笔记）

**用途**：单条笔记，归属某用户；纯文本 `content` 与富文本 `rich_content` 并存；支持收藏。

```sql
CREATE TABLE note (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content LONGTEXT,
    rich_content LONGTEXT,
    favorite TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| `id` | INT | PK，自增 | 笔记主键 |
| `user_id` | INT | NOT NULL | 所属用户，逻辑关联 `notebook_user.id` |
| `title` | VARCHAR(255) | NOT NULL | 标题 |
| `content` | LONGTEXT | 可空 | 纯文本正文（检索、摘要等可用） |
| `rich_content` | LONGTEXT | 可空 | 富文本 HTML 等 |
| `favorite` | TINYINT(1) | NOT NULL，默认 0 | 是否收藏（0/1） |
| `created_at` | TIMESTAMP | 默认当前时间 | 创建时间 |
| `updated_at` | TIMESTAMP | 默认当前时间 | 更新时间 |

**说明**：`schema.sql` 未声明外键；`user_id` 在应用层按用户隔离数据。与 `note_category` 通过 `note_id` 关联。

---

## 3. `category`（分类）

**用途**：每个用户一套分类名；同一用户下分类名唯一。

```sql
CREATE TABLE category (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);
```

| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| `id` | INT | PK，自增 | 分类主键 |
| `user_id` | INT | NOT NULL | 所属用户，逻辑关联 `notebook_user.id` |
| `name` | VARCHAR(64) | NOT NULL | 分类名称 |
| `created_at` | TIMESTAMP | 默认当前时间 | 创建时间 |
| `updated_at` | TIMESTAMP | 默认当前时间 | 更新时间 |

**索引/约束**：`UNIQUE (user_id, name)`，保证同一用户分类名不重复。

---

## 4. `note_category`（笔记—分类关联）

**用途**：多对多：一条笔记可属于多个分类，一个分类下有多条笔记。

```sql
CREATE TABLE note_category (
    id INT AUTO_INCREMENT PRIMARY KEY,
    note_id INT NOT NULL,
    category_id INT NOT NULL,
    UNIQUE (note_id, category_id)
);
```

| 字段 | 类型 | 约束/默认值 | 说明 |
|------|------|-------------|------|
| `id` | INT | PK，自增 | 关联行主键 |
| `note_id` | INT | NOT NULL | 逻辑关联 `note.id` |
| `category_id` | INT | NOT NULL | 逻辑关联 `category.id` |

**索引/约束**：`UNIQUE (note_id, category_id)`，同一笔记在同一分类下只出现一次。

---

## 实体关系（逻辑）

- `notebook_user` **1 — N** `note`（`note.user_id`）
- `notebook_user` **1 — N** `category`（`category.user_id`）
- `note` **N — M** `category`（通过 `note_category`）
