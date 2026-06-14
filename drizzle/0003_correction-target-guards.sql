CREATE TRIGGER `corrections_validate_target`
BEFORE INSERT ON `corrections`
BEGIN
	SELECT CASE
		WHEN NEW.`target_type` NOT IN (
			'observation',
			'project_event',
			'project',
			'project_hypothesis'
		) THEN RAISE(ABORT, 'corrections target_type is invalid')
		WHEN NEW.`target_type` = 'observation'
			AND NOT EXISTS (SELECT 1 FROM `observations` WHERE `id` = NEW.`target_id`)
			THEN RAISE(ABORT, 'corrections target does not exist')
		WHEN NEW.`target_type` = 'project_event'
			AND NOT EXISTS (SELECT 1 FROM `project_events` WHERE `id` = NEW.`target_id`)
			THEN RAISE(ABORT, 'corrections target does not exist')
		WHEN NEW.`target_type` = 'project'
			AND NOT EXISTS (SELECT 1 FROM `projects` WHERE `id` = NEW.`target_id`)
			THEN RAISE(ABORT, 'corrections target does not exist')
		WHEN NEW.`target_type` = 'project_hypothesis'
			AND NOT EXISTS (SELECT 1 FROM `project_hypotheses` WHERE `id` = NEW.`target_id`)
			THEN RAISE(ABORT, 'corrections target does not exist')
	END;
END;
--> statement-breakpoint
CREATE TRIGGER `corrections_reject_update`
BEFORE UPDATE ON `corrections`
BEGIN
	SELECT RAISE(ABORT, 'corrections is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `corrections_reject_delete`
BEFORE DELETE ON `corrections`
BEGIN
	SELECT RAISE(ABORT, 'corrections is immutable');
END;
