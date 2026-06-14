CREATE TABLE `__corrections_migration_guard` (
	`valid` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `__corrections_migration_guard_reject_invalid`
BEFORE INSERT ON `__corrections_migration_guard`
WHEN NEW.`valid` = 0
BEGIN
	SELECT RAISE(ABORT, 'invalid pre-existing corrections');
END;
--> statement-breakpoint
INSERT INTO `__corrections_migration_guard` (`valid`)
SELECT CASE WHEN EXISTS (
	SELECT 1
	FROM `corrections` AS `correction`
	WHERE `correction`.`target_type` NOT IN (
		'observation',
		'project_event',
		'project',
		'project_hypothesis'
	)
	OR (
		`correction`.`target_type` = 'observation'
		AND NOT EXISTS (
			SELECT 1 FROM `observations`
			WHERE `observations`.`id` = `correction`.`target_id`
		)
	)
	OR (
		`correction`.`target_type` = 'project_event'
		AND NOT EXISTS (
			SELECT 1 FROM `project_events`
			WHERE `project_events`.`id` = `correction`.`target_id`
		)
	)
	OR (
		`correction`.`target_type` = 'project'
		AND NOT EXISTS (
			SELECT 1 FROM `projects`
			WHERE `projects`.`id` = `correction`.`target_id`
		)
	)
	OR (
		`correction`.`target_type` = 'project_hypothesis'
		AND NOT EXISTS (
			SELECT 1 FROM `project_hypotheses`
			WHERE `project_hypotheses`.`id` = `correction`.`target_id`
		)
	)
) THEN 0 ELSE 1 END;
--> statement-breakpoint
DROP TABLE `__corrections_migration_guard`;
--> statement-breakpoint
CREATE TRIGGER `projects_reject_delete_with_correction`
BEFORE DELETE ON `projects`
WHEN EXISTS (
	SELECT 1 FROM `corrections`
	WHERE `target_type` = 'project' AND `target_id` = OLD.`id`
)
BEGIN
	SELECT RAISE(ABORT, 'project is referenced by an immutable correction');
END;
--> statement-breakpoint
CREATE TRIGGER `project_hypotheses_reject_delete_with_correction`
BEFORE DELETE ON `project_hypotheses`
WHEN EXISTS (
	SELECT 1 FROM `corrections`
	WHERE `target_type` = 'project_hypothesis' AND `target_id` = OLD.`id`
)
BEGIN
	SELECT RAISE(ABORT, 'project_hypothesis is referenced by an immutable correction');
END;
