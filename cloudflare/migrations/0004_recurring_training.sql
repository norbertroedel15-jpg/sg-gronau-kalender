ALTER TABLE event_types ADD COLUMN is_training INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_types ADD COLUMN default_weekdays TEXT;
INSERT OR IGNORE INTO event_types(id,name,name_key,color,is_training,default_weekdays) VALUES
 ('training_first_team','Training 1. Mannschaft','training 1. mannschaft','#1d4ed8',1,'[2,4]'),
 ('training_ah','Training AH','training ah','#7c3aed',1,'[3]'),
 ('training_bambini','Training Bambini','training bambini','#eab308',1,NULL),
 ('training_f','Training F-Jugend','training f-jugend','#ea580c',1,NULL),
 ('training_e','Training E-Jugend','training e-jugend','#0f766e',1,NULL),
 ('training_d','Training D-Jugend','training d-jugend','#b91c1c',1,NULL),
 ('training_c','Training C-Jugend','training c-jugend','#0369a1',1,NULL),
 ('training_women','Training Damen','training damen','#be185d',1,NULL);
UPDATE event_types SET is_training=1,
 default_weekdays=CASE name_key WHEN 'training 1. mannschaft' THEN '[2,4]' WHEN 'training ah' THEN '[3]' ELSE default_weekdays END
 WHERE name_key IN ('training 1. mannschaft','training ah','training bambini','training f-jugend','training e-jugend','training d-jugend','training c-jugend','training damen');
CREATE TABLE event_series (
 id TEXT PRIMARY KEY,
 start_date TEXT NOT NULL,
 end_date TEXT NOT NULL,
 weekdays TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 last_mutation TEXT
);
ALTER TABLE events ADD COLUMN series_id TEXT REFERENCES event_series(id);
CREATE INDEX events_series ON events(series_id);
