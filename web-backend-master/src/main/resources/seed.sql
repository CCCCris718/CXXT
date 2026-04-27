INSERT INTO admin (user_code, name, sex, enabled, password, department, created_by, updated_by)
VALUES ('root', '管理员', 1, 1, '*E6CC90B878B948C35E92B003C792C46C58C4AF40', '系统', 1, 1);

INSERT INTO admin_priv (admin_id, mod_id, priv)
VALUES ('1', 'admin', 'page');

INSERT INTO notebook_user (id, username, password, enabled)
VALUES (1, 'alice0', '*6BB4837EB74329105EE4568DDA7DC67ED2CA2AD9', 1);

INSERT INTO notebook_user (id, username, password, enabled)
VALUES (2, 'bobby0', '*6BB4837EB74329105EE4568DDA7DC67ED2CA2AD9', 1);

INSERT INTO category (id, user_id, name)
VALUES (1, 1, '学习');

INSERT INTO category (id, user_id, name)
VALUES (2, 1, '待办');

INSERT INTO category (id, user_id, name)
VALUES (3, 1, '生活');

INSERT INTO category (id, user_id, name)
VALUES (4, 2, '工作');

INSERT INTO note (id, user_id, title, content)
VALUES (1, 1, '线代复习提纲', '今天整理矩阵乘法、逆矩阵和特征值三个重点。');

INSERT INTO note (id, user_id, title, content)
VALUES (2, 1, '本周待办', '完成实验报告，周五前提交作业，并准备小组汇报。');

INSERT INTO note (id, user_id, title, content)
VALUES (3, 1, '周末安排', '周六晨跑，下午采购，下周一前把笔记系统再过一遍。');

INSERT INTO note (id, user_id, title, content)
VALUES (4, 2, 'Bob 项目记录', '整理接口联调清单并确认发布窗口。');

INSERT INTO note_category (note_id, category_id)
VALUES (1, 1);

INSERT INTO note_category (note_id, category_id)
VALUES (2, 1);

INSERT INTO note_category (note_id, category_id)
VALUES (2, 2);

INSERT INTO note_category (note_id, category_id)
VALUES (3, 3);

INSERT INTO note_category (note_id, category_id)
VALUES (4, 4);
