CREATE INDEX `corrections_target_type_target_id_idx` ON `corrections` (`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_evidence_event_observation_unique` ON `event_evidence` (`event_id`,`observation_id`);--> statement-breakpoint
CREATE INDEX `event_evidence_event_id_idx` ON `event_evidence` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_evidence_observation_id_idx` ON `event_evidence` (`observation_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hypothesis_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`hypothesis_id` text NOT NULL,
	`observation_id` text,
	`signal_id` text,
	FOREIGN KEY (`hypothesis_id`) REFERENCES `project_hypotheses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hypothesis_evidence_exactly_one_source_check" CHECK(("__new_hypothesis_evidence"."observation_id" is not null and "__new_hypothesis_evidence"."signal_id" is null) or ("__new_hypothesis_evidence"."observation_id" is null and "__new_hypothesis_evidence"."signal_id" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_hypothesis_evidence`("id", "hypothesis_id", "observation_id", "signal_id") SELECT "id", "hypothesis_id", "observation_id", "signal_id" FROM `hypothesis_evidence`;--> statement-breakpoint
DROP TABLE `hypothesis_evidence`;--> statement-breakpoint
ALTER TABLE `__new_hypothesis_evidence` RENAME TO `hypothesis_evidence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `hypothesis_evidence_hypothesis_observation_unique` ON `hypothesis_evidence` (`hypothesis_id`,`observation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `hypothesis_evidence_hypothesis_signal_unique` ON `hypothesis_evidence` (`hypothesis_id`,`signal_id`);--> statement-breakpoint
CREATE INDEX `hypothesis_evidence_hypothesis_id_idx` ON `hypothesis_evidence` (`hypothesis_id`);--> statement-breakpoint
CREATE INDEX `hypothesis_evidence_observation_id_idx` ON `hypothesis_evidence` (`observation_id`);--> statement-breakpoint
CREATE INDEX `hypothesis_evidence_signal_id_idx` ON `hypothesis_evidence` (`signal_id`);--> statement-breakpoint
CREATE INDEX `project_events_project_occurred_at_idx` ON `project_events` (`project_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `project_hypotheses_state_last_seen_at_idx` ON `project_hypotheses` (`state`,`last_seen_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_snapshots_one_current_per_project_unique` ON `project_snapshots` (`project_id`) WHERE "project_snapshots"."is_current" = 1;--> statement-breakpoint
CREATE INDEX `project_snapshots_project_current_idx` ON `project_snapshots` (`project_id`,`is_current`);--> statement-breakpoint
CREATE UNIQUE INDEX `signal_evidence_signal_observation_unique` ON `signal_evidence` (`signal_id`,`observation_id`);--> statement-breakpoint
CREATE INDEX `signal_evidence_signal_id_idx` ON `signal_evidence` (`signal_id`);--> statement-breakpoint
CREATE INDEX `signal_evidence_observation_id_idx` ON `signal_evidence` (`observation_id`);--> statement-breakpoint
CREATE TABLE `__new_projection_checkpoints` (
	`name` text PRIMARY KEY NOT NULL,
	`last_event_id` text,
	`projection_version` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`last_event_id`) REFERENCES `project_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_projection_checkpoints`("name", "last_event_id", "projection_version", "status", "error", "updated_at") SELECT "name", "last_event_id", "projection_version", "status", "error", "updated_at" FROM `projection_checkpoints`;--> statement-breakpoint
DROP TABLE `projection_checkpoints`;--> statement-breakpoint
ALTER TABLE `__new_projection_checkpoints` RENAME TO `projection_checkpoints`;
--> statement-breakpoint
CREATE TRIGGER `observations_reject_update`
BEFORE UPDATE ON `observations`
BEGIN
	SELECT RAISE(ABORT, 'observations is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `observations_reject_delete`
BEFORE DELETE ON `observations`
BEGIN
	SELECT RAISE(ABORT, 'observations is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `project_events_reject_update`
BEFORE UPDATE ON `project_events`
BEGIN
	SELECT RAISE(ABORT, 'project_events is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `project_events_reject_delete`
BEFORE DELETE ON `project_events`
BEGIN
	SELECT RAISE(ABORT, 'project_events is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `event_evidence_reject_update`
BEFORE UPDATE ON `event_evidence`
BEGIN
	SELECT RAISE(ABORT, 'event_evidence is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `event_evidence_reject_delete`
BEFORE DELETE ON `event_evidence`
BEGIN
	SELECT RAISE(ABORT, 'event_evidence is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `signal_evidence_reject_update`
BEFORE UPDATE ON `signal_evidence`
BEGIN
	SELECT RAISE(ABORT, 'signal_evidence is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `signal_evidence_reject_delete`
BEFORE DELETE ON `signal_evidence`
BEGIN
	SELECT RAISE(ABORT, 'signal_evidence is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `hypothesis_evidence_reject_update`
BEFORE UPDATE ON `hypothesis_evidence`
BEGIN
	SELECT RAISE(ABORT, 'hypothesis_evidence is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `hypothesis_evidence_reject_delete`
BEFORE DELETE ON `hypothesis_evidence`
BEGIN
	SELECT RAISE(ABORT, 'hypothesis_evidence is immutable');
END;
