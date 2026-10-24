-- CCIT106 Weeks 1–8: ensure linked reports and persistent item timeline events.
-- Run once against an existing found_it database in MySQL Workbench/phpMyAdmin.
USE `found_it`;

DELIMITER //
CREATE PROCEDURE `migrate_item_timeline_002`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'items'
      AND COLUMN_NAME = 'related_item_id'
  ) THEN
    ALTER TABLE `items` ADD COLUMN `related_item_id` int(11) DEFAULT NULL AFTER `reporter_id`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'items'
      AND INDEX_NAME = 'idx_items_related'
  ) THEN
    ALTER TABLE `items` ADD KEY `idx_items_related` (`related_item_id`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'items'
      AND CONSTRAINT_NAME = 'fk_items_related'
  ) THEN
    ALTER TABLE `items`
      ADD CONSTRAINT `fk_items_related`
      FOREIGN KEY (`related_item_id`) REFERENCES `items` (`id`)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END//
DELIMITER ;

CALL `migrate_item_timeline_002`();
DROP PROCEDURE `migrate_item_timeline_002`;

CREATE TABLE IF NOT EXISTS `item_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `item_id` int(11) NOT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `event_type` varchar(40) NOT NULL,
  `message` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_item_events_item_created` (`item_id`, `created_at`),
  KEY `idx_item_events_actor` (`actor_id`),
  CONSTRAINT `fk_item_events_item`
    FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_item_events_actor`
    FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
