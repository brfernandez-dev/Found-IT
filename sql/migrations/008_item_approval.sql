-- 008: admin approval for new reports.
-- A report posted by a student starts as 'pending' and only appears on the
-- campus board after staff approve it. Existing reports stay visible.
USE `found_it`;

DELIMITER //
CREATE PROCEDURE `migrate_008`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items'
      AND COLUMN_NAME = 'approval_status'
  ) THEN
    ALTER TABLE `items`
      ADD COLUMN `approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved' AFTER `status`,
      ADD COLUMN `review_note` varchar(255) DEFAULT NULL AFTER `approval_status`,
      ADD COLUMN `reviewed_at` datetime DEFAULT NULL AFTER `review_note`,
      ADD KEY `idx_items_approval` (`approval_status`);
  END IF;
END//
DELIMITER ;

CALL `migrate_008`();
DROP PROCEDURE `migrate_008`;
