USE found_it;

ALTER TABLE users
  ADD COLUMN profile_image VARCHAR(500) NULL AFTER display_name;
