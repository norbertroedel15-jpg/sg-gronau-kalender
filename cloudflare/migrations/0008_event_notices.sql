CREATE TABLE event_notices (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  series_id TEXT,
  title TEXT NOT NULL,
  type_name TEXT NOT NULL,
  color TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  place TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL,
  until_date TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE event_notice_recipients (
  notice_id TEXT NOT NULL REFERENCES event_notices(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at INTEGER,
  PRIMARY KEY(user_id,notice_id)
);
CREATE INDEX event_notice_unread ON event_notice_recipients(user_id,read_at);
