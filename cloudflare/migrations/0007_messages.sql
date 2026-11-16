CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  client_id TEXT NOT NULL,
  UNIQUE(sender_id,client_id),
  CHECK(sender_id<>recipient_id)
);
CREATE INDEX messages_received ON messages(recipient_id,read_at,id);
CREATE INDEX messages_thread ON messages(sender_id,recipient_id,id);
