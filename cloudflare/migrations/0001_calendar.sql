CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  disabled INTEGER NOT NULL DEFAULT 0,
  auth_version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_version INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  endTime TEXT NOT NULL,
  place TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('training', 'spiel', 'sitzung')),
  createdBy TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX events_date ON events(date,time,id);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX rate_limits_expiry ON rate_limits(expires);
