-- Enlarge master.partners contact columns to fit AES-256-GCM base64 ciphertext.
--
-- BUG-04 / VAL-FAIL-01: contact_name and contact_phone are encrypted at rest
-- (see item_usecase.go CreatePartner/UpdatePartner). The base64 ciphertext is
-- longer than the plaintext — for a 30-char phone the ciphertext is ~80 chars,
-- and for a 100-char name it is ~172 chars — so the original VARCHAR(30) /
-- VARCHAR(100) columns rejected the insert with string_data_right_truncation
-- (HTTP 500 ERR_INTERNAL).
--
-- VARCHAR(255) comfortably fits the worst-case ciphertext for the DTO
-- max-length inputs (contact_name max=100, contact_phone max=30).
ALTER TABLE master.partners
    ALTER COLUMN contact_name  TYPE VARCHAR(255),
    ALTER COLUMN contact_phone TYPE VARCHAR(255);
