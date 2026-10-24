ALTER TABLE `rooms` ADD `unlocked_act` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Preserve acts already reached before this gate existed. Scene indices refer
-- to the 15-scene script shipped with this migration (act 2: 7, act 3: 10).
UPDATE rooms SET unlocked_act = CASE
  WHEN status = 'finished' OR step >= 10
    OR EXISTS (SELECT 1 FROM room_reading_progress p WHERE p.room = rooms.code AND p.step >= 10)
    OR EXISTS (SELECT 1 FROM json_each(rooms.revealed_answers) WHERE value = 'scene-14') THEN 3
  WHEN step >= 7
    OR EXISTS (SELECT 1 FROM room_reading_progress p WHERE p.room = rooms.code AND p.step >= 7)
    OR EXISTS (SELECT 1 FROM json_each(rooms.revealed_answers) WHERE value = 'scene-10') THEN 2
  ELSE 1 END,
  version = version + 1;
