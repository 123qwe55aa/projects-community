CREATE TABLE `corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`correction_type` text NOT NULL,
	`payload` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`observation_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `project_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `hypothesis_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`hypothesis_id` text NOT NULL,
	`observation_id` text,
	`signal_id` text,
	FOREIGN KEY (`hypothesis_id`) REFERENCES `project_hypotheses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`summary` text NOT NULL,
	`type` text NOT NULL,
	`source_quote` text NOT NULL,
	`source_conversation_ref` text NOT NULL,
	`source_message_ref` text NOT NULL,
	`proposed_project_id` text,
	`assignment_confidence` integer,
	`assignment_rationale` text,
	`observed_at` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	`actor` text NOT NULL,
	`schema_version` integer NOT NULL,
	FOREIGN KEY (`proposed_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observations_idempotency_key_unique` ON `observations` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `project_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`rationale` text,
	`actor` text NOT NULL,
	`idempotency_key` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`schema_version` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_events_idempotency_key_unique` ON `project_events` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `project_hypotheses` (
	`id` text PRIMARY KEY NOT NULL,
	`stable_key` text NOT NULL,
	`title` text NOT NULL,
	`explanation` text NOT NULL,
	`state` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`promoted_project_id` text,
	FOREIGN KEY (`promoted_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_hypotheses_stable_key_unique` ON `project_hypotheses` (`stable_key`);--> statement-breakpoint
CREATE TABLE `project_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`summary` text NOT NULL,
	`lifecycle_state` text NOT NULL,
	`lifecycle_rationale` text,
	`active_themes` text NOT NULL,
	`obstacles` text NOT NULL,
	`unresolved_questions` text NOT NULL,
	`recent_changes` text NOT NULL,
	`source_event_id` text,
	`projection_version` integer NOT NULL,
	`is_current` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_event_id`) REFERENCES `project_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projection_checkpoints` (
	`name` text PRIMARY KEY NOT NULL,
	`last_event_id` text,
	`projection_version` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `signal_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`signal_id` text NOT NULL,
	`observation_id` text NOT NULL,
	FOREIGN KEY (`signal_id`) REFERENCES `signals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`observation_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`stable_key` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signals_stable_key_unique` ON `signals` (`stable_key`);