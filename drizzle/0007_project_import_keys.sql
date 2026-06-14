CREATE TABLE `project_import_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`source_ref` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_import_keys_project_id_unique` ON `project_import_keys` (`project_id`);