-- 005: remember WHO sent each notification.
-- Before this, every notification was shown as "From Admin", even when it was
-- caused by another student (a claim, or an "I found it" report).
-- Run once on an existing found_it database (after 004). Safe to re-run.
USE `found_it`;

DELIMITER //
CREATE PROCEDURE `migrate_005`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications'
      AND COLUMN_NAME = 'sender_id'
  ) THEN
    ALTER TABLE `notifications`
      ADD COLUMN `sender_id` int(11) DEFAULT NULL AFTER `user_id`,
      ADD KEY `idx_notifications_sender` (`sender_id`),
      ADD CONSTRAINT `fk_notifications_sender`
        FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END//
DELIMITER ;

CALL `migrate_005`();
DROP PROCEDURE `migrate_005`;

-- Backfill old notifications so they show the right sender.
-- Claims (to the finder and to staff): sender = the student who claimed.
UPDATE `notifications` n
JOIN `claims` c ON c.id = n.claim_id
SET n.sender_id = c.user_id
WHERE n.sender_id IS NULL
  AND (n.message LIKE 'Someone submitted a claim%'
       OR n.message LIKE 'A new claim needs review%');

-- "I found it" reports: sender = the student who reported the found item.
UPDATE `notifications` n
JOIN `items` i ON i.id = n.item_id
SET n.sender_id = i.reporter_id
WHERE n.sender_id IS NULL
  AND (n.message LIKE 'Someone reported finding%'
       OR n.message LIKE 'A new found-item report%');

-- Claim decisions / transaction notices stay NULL = shown as "Found-It Admin".
