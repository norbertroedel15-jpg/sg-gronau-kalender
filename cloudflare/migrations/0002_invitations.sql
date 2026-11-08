CREATE TABLE invitations (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  auth_version INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX invitations_expiry ON invitations(expires);
