-- Dev MySQL: create default database, app user, and provisioner admin user.
-- WordPress tables and per-site databases are created by the WP provisioner at install time.

-- Default shared database (legacy / fallback)
CREATE DATABASE IF NOT EXISTS wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Application user for legacy / direct WP access
CREATE USER IF NOT EXISTS 'wordpress'@'%' IDENTIFIED BY 'wordpress';
GRANT ALL PRIVILEGES ON wordpress.* TO 'wordpress'@'%';

-- Provisioner admin: used by tundrad to CREATE DATABASE + CREATE USER per install.
-- Needs GRANT OPTION so it can grant privileges on newly-created databases.
CREATE USER IF NOT EXISTS 'tundra_admin'@'%' IDENTIFIED BY 'devsecret';
GRANT ALL PRIVILEGES ON *.* TO 'tundra_admin'@'%' WITH GRANT OPTION;

FLUSH PRIVILEGES;
