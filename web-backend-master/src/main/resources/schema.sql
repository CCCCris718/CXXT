DROP TABLE IF EXISTS note_category;
DROP TABLE IF EXISTS category;
DROP TABLE IF EXISTS note;
DROP TABLE IF EXISTS notebook_user;
DROP TABLE IF EXISTS login_log;
DROP TABLE IF EXISTS admin_priv;
DROP TABLE IF EXISTS admin;

CREATE TABLE admin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_code VARCHAR(40) NOT NULL,
    name VARCHAR(32),
    sex TINYINT DEFAULT 1,
    enabled BIT DEFAULT 1,
    password VARCHAR(64),
    department VARCHAR(128),
    phone VARCHAR(32),
    email VARCHAR(128),
    created_by INT,
    updated_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_code)
);

CREATE TABLE admin_priv (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id VARCHAR(40) NOT NULL,
    mod_id VARCHAR(64) NOT NULL,
    priv VARCHAR(64) NOT NULL,
    UNIQUE (admin_id, mod_id, priv)
);

CREATE TABLE login_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_code VARCHAR(64) NOT NULL,
    ip_address VARCHAR(46) NOT NULL,
    name VARCHAR(64),
    os VARCHAR(128),
    browser VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE category (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);

CREATE TABLE note_category (
    id INT AUTO_INCREMENT PRIMARY KEY,
    note_id INT NOT NULL,
    category_id INT NOT NULL,
    UNIQUE (note_id, category_id)
);
