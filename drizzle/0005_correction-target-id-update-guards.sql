CREATE TRIGGER `projects_reject_id_update_with_correction`
BEFORE UPDATE OF `id` ON `projects`
WHEN OLD.`id` IS NOT NEW.`id` AND EXISTS (
	SELECT 1 FROM `corrections`
	WHERE `target_type` = 'project' AND `target_id` = OLD.`id`
)
BEGIN
	SELECT RAISE(ABORT, 'project ID is referenced by an immutable correction');
END;
--> statement-breakpoint
CREATE TRIGGER `project_hypotheses_reject_id_update_with_correction`
BEFORE UPDATE OF `id` ON `project_hypotheses`
WHEN OLD.`id` IS NOT NEW.`id` AND EXISTS (
	SELECT 1 FROM `corrections`
	WHERE `target_type` = 'project_hypothesis' AND `target_id` = OLD.`id`
)
BEGIN
	SELECT RAISE(ABORT, 'project_hypothesis ID is referenced by an immutable correction');
END;
