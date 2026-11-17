CREATE TABLE outlook_connections (
  admin_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  encrypted_tokens TEXT,
  expires INTEGER,
  address TEXT,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE outlook_device_codes (
  admin_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_code TEXT NOT NULL,
  expires INTEGER NOT NULL,
  next_poll INTEGER NOT NULL,
  interval_seconds INTEGER NOT NULL,
  connection_version INTEGER NOT NULL
);
