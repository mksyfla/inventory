-- Revert partner contact column sizes back to their pre-encryption widths.
-- Only safe if no encrypted (ciphertext) values remain in the columns, since
-- ciphertext would be truncated back down to these narrower widths.
ALTER TABLE master.partners
    ALTER COLUMN contact_name  TYPE VARCHAR(100),
    ALTER COLUMN contact_phone TYPE VARCHAR(30);
