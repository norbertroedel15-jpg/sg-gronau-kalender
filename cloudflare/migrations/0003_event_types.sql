CREATE TABLE event_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO event_types(id,name,name_key,color) VALUES
 ('training','Training','training','#156649'),
 ('spiel','Spiel','spiel','#b42318'),
 ('sitzung','Sitzung','sitzung','#1a5f7a');
CREATE TABLE events_with_types (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  endTime TEXT NOT NULL,
  place TEXT NOT NULL,
  type TEXT NOT NULL REFERENCES event_types(id),
  createdBy TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO events_with_types(id,title,date,time,endTime,place,type,createdBy,version)
 SELECT id,title,date,time,endTime,place,type,createdBy,version FROM events;
DROP TABLE events;
ALTER TABLE events_with_types RENAME TO events;
CREATE INDEX events_date ON events(date,time,id);
