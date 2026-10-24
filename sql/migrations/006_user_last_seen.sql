-- 006: track when each user was last active, so the site can show who is
-- online right now ("Online now" panel).
-- Run once on an existing found_it database (after 005). Safe to re-run.
USE `found_it`;

DELIMITER //
CREATE PROCEDURE `migrate_006`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'last_seen_at'
  ) THEN
    ALTER TABLE `users`
      ADD COLUMN `last_seen_at` datetime DEFAULT NULL AFTER `role`,
      ADD KEY `idx_users_last_seen` (`last_seen_at`);
  END IF;
END//
DELIMITER ;

CALL `migrate_006`();
DROP PROCEDURE `migrate_006`;
