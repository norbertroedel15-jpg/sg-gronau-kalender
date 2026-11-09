ALTER TABLE event_types ADD COLUMN game_type_id TEXT REFERENCES event_types(id);
INSERT OR IGNORE INTO event_types(id,name,name_key,color) VALUES
 ('game_first_team','Spiel 1. Mannschaft','spiel 1. mannschaft','#1d4ed8'),
 ('game_ah','Spiel AH','spiel ah','#7c3aed'),
 ('game_bambini','Spiel Bambini','spiel bambini','#eab308'),
 ('game_f','Spiel F-Jugend','spiel f-jugend','#ea580c'),
 ('game_e','Spiel E-Jugend','spiel e-jugend','#0f766e'),
 ('game_d','Spiel D-Jugend','spiel d-jugend','#b91c1c'),
 ('game_c','Spiel C-Jugend','spiel c-jugend','#0369a1'),
 ('game_women','Spiel Damen','spiel damen','#be185d');
WITH teams(training_id,training_key,game_key) AS (VALUES
 ('training_first_team','training 1. mannschaft','spiel 1. mannschaft'),
 ('training_ah','training ah','spiel ah'),
 ('training_bambini','training bambini','spiel bambini'),
 ('training_f','training f-jugend','spiel f-jugend'),
 ('training_e','training e-jugend','spiel e-jugend'),
 ('training_d','training d-jugend','spiel d-jugend'),
 ('training_c','training c-jugend','spiel c-jugend'),
 ('training_women','training damen','spiel damen'))
UPDATE event_types SET game_type_id=(
 SELECT g.id FROM teams d JOIN event_types g ON g.name_key=d.game_key
 WHERE event_types.id=d.training_id OR event_types.name_key=d.training_key LIMIT 1)
 WHERE is_training=1 AND EXISTS(SELECT 1 FROM teams d WHERE event_types.id=d.training_id OR event_types.name_key=d.training_key);
UPDATE event_types SET color=COALESCE((SELECT t.color FROM event_types t WHERE t.game_type_id=event_types.id LIMIT 1),color)
 WHERE id IN ('game_first_team','game_ah','game_bambini','game_f','game_e','game_d','game_c','game_women');
