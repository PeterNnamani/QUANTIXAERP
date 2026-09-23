-- Record whether a sale was created from a phone or a PC.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_used text;