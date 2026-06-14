CREATE TABLE `ingestion_receipts` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`tool_name` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `ingestion_receipts_reject_update`
BEFORE UPDATE ON `ingestion_receipts`
BEGIN
	SELECT RAISE(ABORT, 'ingestion_receipts is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `ingestion_receipts_reject_delete`
BEFORE DELETE ON `ingestion_receipts`
BEGIN
	SELECT RAISE(ABORT, 'ingestion_receipts is immutable');
END;
