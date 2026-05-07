-- Dev MySQL init: wordpress database + user + sample WP tables
CREATE DATABASE IF NOT EXISTS wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'wordpress'@'%' IDENTIFIED BY 'wordpress';
GRANT ALL PRIVILEGES ON wordpress.* TO 'wordpress'@'%';
FLUSH PRIVILEGES;

USE wordpress;

CREATE TABLE IF NOT EXISTS wp_options (
  option_id   bigint unsigned NOT NULL AUTO_INCREMENT,
  option_name varchar(191)    NOT NULL DEFAULT '',
  option_value longtext        NOT NULL,
  autoload    varchar(20)     NOT NULL DEFAULT 'yes',
  PRIMARY KEY (option_id),
  UNIQUE KEY option_name (option_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wp_users (
  ID                  bigint unsigned NOT NULL AUTO_INCREMENT,
  user_login          varchar(60)     NOT NULL DEFAULT '',
  user_pass           varchar(255)    NOT NULL DEFAULT '',
  user_nicename       varchar(50)     NOT NULL DEFAULT '',
  user_email          varchar(100)    NOT NULL DEFAULT '',
  user_url            varchar(100)    NOT NULL DEFAULT '',
  user_registered     datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_activation_key varchar(255)    NOT NULL DEFAULT '',
  user_status         int             NOT NULL DEFAULT '0',
  display_name        varchar(250)    NOT NULL DEFAULT '',
  PRIMARY KEY (ID),
  KEY user_login_key (user_login),
  KEY user_email (user_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wp_posts (
  ID                    bigint unsigned NOT NULL AUTO_INCREMENT,
  post_author           bigint unsigned NOT NULL DEFAULT '0',
  post_date             datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  post_date_gmt         datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  post_content          longtext        NOT NULL,
  post_title            text            NOT NULL,
  post_excerpt          text            NOT NULL,
  post_status           varchar(20)     NOT NULL DEFAULT 'publish',
  comment_status        varchar(20)     NOT NULL DEFAULT 'open',
  ping_status           varchar(20)     NOT NULL DEFAULT 'open',
  post_password         varchar(255)    NOT NULL DEFAULT '',
  post_name             varchar(200)    NOT NULL DEFAULT '',
  post_modified         datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  post_modified_gmt     datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  post_parent           bigint unsigned NOT NULL DEFAULT '0',
  guid                  varchar(255)    NOT NULL DEFAULT '',
  menu_order            int             NOT NULL DEFAULT '0',
  post_type             varchar(20)     NOT NULL DEFAULT 'post',
  post_mime_type        varchar(100)    NOT NULL DEFAULT '',
  comment_count         bigint          NOT NULL DEFAULT '0',
  PRIMARY KEY (ID),
  KEY post_name (post_name(191)),
  KEY type_status_date (post_type, post_status, post_date, ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wp_postmeta (
  meta_id    bigint unsigned NOT NULL AUTO_INCREMENT,
  post_id    bigint unsigned NOT NULL DEFAULT '0',
  meta_key   varchar(255)             DEFAULT NULL,
  meta_value longtext,
  PRIMARY KEY (meta_id),
  KEY post_id (post_id),
  KEY meta_key (meta_key(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wp_usermeta (
  umeta_id   bigint unsigned NOT NULL AUTO_INCREMENT,
  user_id    bigint unsigned NOT NULL DEFAULT '0',
  meta_key   varchar(255)             DEFAULT NULL,
  meta_value longtext,
  PRIMARY KEY (umeta_id),
  KEY user_id (user_id),
  KEY meta_key (meta_key(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wp_comments (
  comment_ID           bigint unsigned NOT NULL AUTO_INCREMENT,
  comment_post_ID      bigint unsigned NOT NULL DEFAULT '0',
  comment_author       tinytext        NOT NULL,
  comment_author_email varchar(100)    NOT NULL DEFAULT '',
  comment_author_url   varchar(200)    NOT NULL DEFAULT '',
  comment_author_IP    varchar(100)    NOT NULL DEFAULT '',
  comment_date         datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  comment_date_gmt     datetime        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  comment_content      text            NOT NULL,
  comment_karma        int             NOT NULL DEFAULT '0',
  comment_approved     varchar(20)     NOT NULL DEFAULT '1',
  comment_agent        varchar(255)    NOT NULL DEFAULT '',
  comment_type         varchar(20)     NOT NULL DEFAULT 'comment',
  comment_parent       bigint unsigned NOT NULL DEFAULT '0',
  user_id              bigint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (comment_ID),
  KEY comment_post_ID (comment_post_ID),
  KEY comment_approved_date_gmt (comment_approved, comment_date_gmt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wp_terms (
  term_id    bigint unsigned NOT NULL AUTO_INCREMENT,
  name       varchar(200)    NOT NULL DEFAULT '',
  slug       varchar(200)    NOT NULL DEFAULT '',
  term_group bigint          NOT NULL DEFAULT '0',
  PRIMARY KEY (term_id),
  KEY slug (slug(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wp_term_taxonomy (
  term_taxonomy_id bigint unsigned NOT NULL AUTO_INCREMENT,
  term_id          bigint unsigned NOT NULL DEFAULT '0',
  taxonomy         varchar(32)     NOT NULL DEFAULT '',
  description      longtext        NOT NULL,
  parent           bigint unsigned NOT NULL DEFAULT '0',
  count            bigint          NOT NULL DEFAULT '0',
  PRIMARY KEY (term_taxonomy_id),
  UNIQUE KEY term_id_taxonomy (term_id, taxonomy)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wp_term_relationships (
  object_id        bigint unsigned NOT NULL DEFAULT '0',
  term_taxonomy_id bigint unsigned NOT NULL DEFAULT '0',
  term_order       int             NOT NULL DEFAULT '0',
  PRIMARY KEY (object_id, term_taxonomy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed wp_options with realistic defaults
INSERT IGNORE INTO wp_options (option_name, option_value, autoload) VALUES
  ('siteurl',             'https://api.cognify.ai',   'yes'),
  ('blogname',            'Cognify API Blog',          'yes'),
  ('blogdescription',     'Just another WordPress site', 'yes'),
  ('admin_email',         'admin@api.cognify.ai',      'yes'),
  ('blogpublic',          '1',                         'yes'),
  ('permalink_structure', '/%postname%/',              'yes'),
  ('active_plugins',      'a:0:{}',                   'yes'),
  ('template',            'twentytwentyfour',          'yes'),
  ('stylesheet',          'twentytwentyfour',          'yes'),
  ('wp_user_roles',       '',                          'yes');

-- Seed wp_users with an admin
INSERT IGNORE INTO wp_users
  (ID, user_login, user_pass, user_nicename, user_email, user_registered, display_name)
VALUES
  (1, 'admin', '$P$BIlkyHBM7LCWqBYULThsJTFVzEm8bO/', 'admin',
   'admin@api.cognify.ai', NOW(), 'Admin');

INSERT IGNORE INTO wp_usermeta (user_id, meta_key, meta_value) VALUES
  (1, 'wp_capabilities',   'a:1:{s:13:"administrator";b:1;}'),
  (1, 'wp_user_level',     '10');

-- Seed some posts
INSERT IGNORE INTO wp_posts
  (ID, post_author, post_date, post_date_gmt, post_content, post_title, post_status, post_type, post_name, post_modified, post_modified_gmt)
VALUES
  (1, 1, NOW(), NOW(), '<p>Welcome to the Cognify API Blog.</p>', 'Hello World',       'publish', 'post', 'hello-world',       NOW(), NOW()),
  (2, 1, NOW(), NOW(), '',                                         'Sample Page',       'publish', 'page', 'sample-page',       NOW(), NOW()),
  (3, 1, NOW(), NOW(), '<p>API v2 is now generally available.</p>', 'API v2 Released', 'publish', 'post', 'api-v2-released',   NOW(), NOW());
