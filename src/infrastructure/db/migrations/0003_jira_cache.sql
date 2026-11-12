CREATE TABLE "jira_issue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"summary" text NOT NULL,
	"status" text NOT NULL,
	"status_category" text NOT NULL,
	"request_type" text NOT NULL,
	"priority" text,
	"assignee_id" text,
	"jira_created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"jira_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jira_issue_key_unique" UNIQUE("key"),
	CONSTRAINT "jira_issue_status_category_valid" CHECK ("jira_issue"."status_category" in ('new', 'indeterminate', 'done'))
);
--> statement-breakpoint
CREATE TABLE "jira_sla_cycle" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issue_key" text NOT NULL,
	"metric" text NOT NULL,
	"state" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"breach_at" timestamp with time zone,
	"breached" boolean NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	CONSTRAINT "jira_sla_cycle_metric_valid" CHECK ("jira_sla_cycle"."metric" in ('first_response', 'done')),
	CONSTRAINT "jira_sla_cycle_state_valid" CHECK ("jira_sla_cycle"."state" in ('completed', 'ongoing'))
);
--> statement-breakpoint
CREATE TABLE "jira_status_transition" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issue_key" text NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_lock" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"items" integer DEFAULT 0 NOT NULL,
	"error" text,
	CONSTRAINT "sync_run_status_valid" CHECK ("sync_run"."status" in ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "time_zone" text DEFAULT 'America/Bogota' NOT NULL;--> statement-breakpoint
ALTER TABLE "jira_sla_cycle" ADD CONSTRAINT "jira_sla_cycle_issue_key_jira_issue_key_fk" FOREIGN KEY ("issue_key") REFERENCES "public"."jira_issue"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "jira_status_transition" ADD CONSTRAINT "jira_status_transition_issue_key_jira_issue_key_fk" FOREIGN KEY ("issue_key") REFERENCES "public"."jira_issue"("key") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "jira_issue_updated_idx" ON "jira_issue" USING btree ("jira_updated_at");--> statement-breakpoint
CREATE INDEX "jira_issue_status_category_idx" ON "jira_issue" USING btree ("status_category");--> statement-breakpoint
CREATE INDEX "jira_issue_assignee_idx" ON "jira_issue" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "jira_sla_cycle_issue_idx" ON "jira_sla_cycle" USING btree ("issue_key");--> statement-breakpoint
CREATE INDEX "jira_sla_cycle_period_idx" ON "jira_sla_cycle" USING btree ("metric","state","stopped_at");--> statement-breakpoint
CREATE INDEX "jira_status_transition_issue_idx" ON "jira_status_transition" USING btree ("issue_key","at");--> statement-breakpoint
CREATE INDEX "sync_run_source_started_idx" ON "sync_run" USING btree ("source","started_at");