-- Claim messages: a private message box between the person who posted the
-- found item (finder), the person claiming it, and staff.
USE `found_it`;

CREATE TABLE IF NOT EXISTS `claim_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `claim_id` int(11) NOT NULL,
  `sender_id` int(11) DEFAULT NULL,
  `body` varchar(1000) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_claim_messages_claim_created` (`claim_id`, `created_at`),
  KEY `idx_claim_messages_sender` (`sender_id`),
  CONSTRAINT `fk_claim_messages_claim`
    FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_claim_messages_sender`
    FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
