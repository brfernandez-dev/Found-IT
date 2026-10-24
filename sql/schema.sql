CREATE DATABASE IF NOT EXISTS `found_it`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `found_it`;

-- --------------------------------------------------------
-- Table: users
-- --------------------------------------------------------
CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `display_name` varchar(100) NOT NULL,
  `profile_image` varchar(500) DEFAULT NULL,
  `role` enum('user','staff') NOT NULL DEFAULT 'user',
  `last_seen_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: items
-- --------------------------------------------------------
CREATE TABLE `items` (
  `id` int(11) NOT NULL,
  `reference_no` varchar(50) NOT NULL,
  `reporter_id` int(11) DEFAULT NULL,
  `related_item_id` int(11) DEFAULT NULL,
  `item_type` enum('lost','found') NOT NULL,
  `type` enum('lost','found') NOT NULL,
  `status` enum('unclaimed','claim_pending','claimed','returned') NOT NULL DEFAULT 'unclaimed',
  `approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  `review_note` varchar(255) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `trashed_at` datetime DEFAULT NULL,
  `item_name` varchar(150) NOT NULL,
  `title` varchar(150) DEFAULT NULL,
  `description` text NOT NULL,
  `category` varchar(60) NOT NULL,
  `location` varchar(150) NOT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `date_reported` date NOT NULL,
  `reporter_name` varchar(100) NOT NULL,
  `reporter_contact` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: claims
-- --------------------------------------------------------
CREATE TABLE `claims` (
  `id` int(11) NOT NULL,
  `item_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `reason` text NOT NULL,
  `distinguishing_detail` text NOT NULL,
  `date_lost` date DEFAULT NULL,
  `extra_info` text DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: item_events (item timeline)
-- --------------------------------------------------------
CREATE TABLE `item_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `item_id` int(11) NOT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `event_type` varchar(40) NOT NULL,
  `message` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_item_events_item_created` (`item_id`, `created_at`),
  KEY `idx_item_events_actor` (`actor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: claim_messages (message box for each claim)
-- --------------------------------------------------------
CREATE TABLE `claim_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `claim_id` int(11) NOT NULL,
  `sender_id` int(11) DEFAULT NULL,
  `body` varchar(1000) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_claim_messages_claim_created` (`claim_id`, `created_at`),
  KEY `idx_claim_messages_sender` (`sender_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: notifications
-- --------------------------------------------------------
CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `sender_id` int(11) DEFAULT NULL,
  `message` varchar(255) NOT NULL,
  `item_id` int(11) DEFAULT NULL,
  `claim_id` int(11) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_read` (`user_id`, `is_read`),
  KEY `idx_notifications_sender` (`sender_id`),
  KEY `idx_notifications_item` (`item_id`),
  KEY `idx_notifications_claim` (`claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Indexes
-- --------------------------------------------------------
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_users_email` (`email`),
  ADD KEY `idx_users_last_seen` (`last_seen_at`);

ALTER TABLE `items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `reference_no` (`reference_no`),
  ADD KEY `idx_items_reference` (`reference_no`),
  ADD KEY `idx_items_type` (`item_type`),
  ADD KEY `idx_items_status` (`status`),
  ADD KEY `idx_items_approval` (`approval_status`),
  ADD KEY `idx_items_category` (`category`),
  ADD KEY `idx_items_location` (`location`),
  ADD KEY `idx_items_reporter` (`reporter_id`),
  ADD KEY `idx_items_related` (`related_item_id`),
  ADD KEY `idx_items_created` (`created_at`),
  ADD KEY `idx_items_trashed_at` (`trashed_at`);

ALTER TABLE `claims`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_claims_item` (`item_id`),
  ADD KEY `idx_claims_user` (`user_id`),
  ADD KEY `idx_claims_status` (`status`);

-- --------------------------------------------------------
-- AUTO_INCREMENT
-- --------------------------------------------------------
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT,
  AUTO_INCREMENT=1;

ALTER TABLE `items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT,
  AUTO_INCREMENT=1;

ALTER TABLE `claims`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT,
  AUTO_INCREMENT=1;

-- --------------------------------------------------------
-- Foreign Key Constraints
-- --------------------------------------------------------
ALTER TABLE `items`
  ADD CONSTRAINT `fk_items_reporter`
  FOREIGN KEY (`reporter_id`)
  REFERENCES `users` (`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE `claims`
  ADD CONSTRAINT `fk_claim_item`
  FOREIGN KEY (`item_id`)
  REFERENCES `items` (`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_claim_user`
  FOREIGN KEY (`user_id`)
  REFERENCES `users` (`id`)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE `items`
  ADD CONSTRAINT `fk_items_related`
  FOREIGN KEY (`related_item_id`)
  REFERENCES `items` (`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE `item_events`
  ADD CONSTRAINT `fk_item_events_item`
  FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_item_events_actor`
  FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notifications_user`
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_notifications_sender`
  FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_notifications_item`
  FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_notifications_claim`
  FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `claim_messages`
  ADD CONSTRAINT `fk_claim_messages_claim`
  FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_claim_messages_sender`
  FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
