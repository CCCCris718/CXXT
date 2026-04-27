INSERT INTO admin (user_code, name, sex, enabled, password, department, created_by, updated_by)
VALUES ('root', '管理员', 1, 1, '*E6CC90B878B948C35E92B003C792C46C58C4AF40', '系统', 1, 1);

INSERT INTO admin_priv (admin_id, mod_id, priv)
VALUES ('1', 'admin', 'page');

INSERT INTO notebook_user (username, password, enabled)
VALUES ('alice0', '*6BB4837EB74329105EE4568DDA7DC67ED2CA2AD9', 1);

INSERT INTO notebook_user (username, password, enabled)
VALUES ('bobby0', '*6BB4837EB74329105EE4568DDA7DC67ED2CA2AD9', 1);
