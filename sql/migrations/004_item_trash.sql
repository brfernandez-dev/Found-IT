-- Adds a 30-day Trash lifecycle for completed found-item transactions.
ALTER TABLE `items`
  ADD COLUMN `trashed_at` datetime DEFAULT NULL,
  ADD KEY `idx_items_trashed_at` (`trashed_at`);
