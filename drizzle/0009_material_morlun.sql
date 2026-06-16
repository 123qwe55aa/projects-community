CREATE TABLE `github_statistics_snapshots` (
	`project_id` text PRIMARY KEY NOT NULL,
	`repo_full_name` text NOT NULL,
	`repo_url` text NOT NULL,
	`primary_language` text,
	`topics` text NOT NULL,
	`pushed_at` integer,
	`commit_count` integer NOT NULL,
	`pull_request_count` integer NOT NULL,
	`issue_count` integer NOT NULL,
	`star_count` integer NOT NULL,
	`commits_30d` integer NOT NULL,
	`pull_requests_30d` integer NOT NULL,
	`issues_30d` integer NOT NULL,
	`activity_score_30d` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_statistics` (
	`project_id` text PRIMARY KEY NOT NULL,
	`github_repo_full_name` text,
	`inferred_type` text,
	`manual_type` text,
	`last_attempted_at` integer,
	`last_successful_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_statistics_inferred_type_check" CHECK("project_statistics"."inferred_type" in ('application', 'library', 'tooling', 'data', 'content', 'infrastructure', 'community', 'other')),
	CONSTRAINT "project_statistics_manual_type_check" CHECK("project_statistics"."manual_type" in ('application', 'library', 'tooling', 'data', 'content', 'infrastructure', 'community', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_statistics_github_repo_unique` ON `project_statistics` ("github_repo_full_name" collate nocase);