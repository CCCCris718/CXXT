ALTER TABLE note
    ADD COLUMN rich_content LONGTEXT NULL;

-- 收藏标记（0/1），与前端「收藏笔记」一致
ALTER TABLE note
    ADD COLUMN favorite TINYINT(1) NOT NULL DEFAULT 0;

-- 笔记本：记录上次修改「登录用 Notebook ID」的时间
ALTER TABLE notebook_user
    ADD COLUMN username_last_changed_at DATETIME(3) NULL;
