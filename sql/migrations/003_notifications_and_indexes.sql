-- Run once on an existing found_it database (after 001 and 002).
-- Creates the notifications table (it was missing from schema.sql) and adds
-- indexes the app relies on. Safe to re-run: every step checks first.
USE `found_it`;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `message` varchar(255) NOT NULL,
  `item_id` int(11) DEFAULT NULL,
  `claim_id` int(11) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_read` (`user_id`, `is_read`),
  KEY `idx_notifications_item` (`item_id`),
  KEY `idx_notifications_claim` (`claim_id`),
  CONSTRAINT `fk_notifications_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_claim`
    FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER //
CREATE PROCEDURE `migrate_003`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items'
      AND INDEX_NAME = 'idx_items_created'
  ) THEN
    ALTER TABLE `items` ADD KEY `idx_items_created` (`created_at`);
  END IF;
END//
DELIMITER ;

CALL `migrate_003`();
DROP PROCEDURE `migrate_003`;
