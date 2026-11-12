ALTER TABLE "jira_issue" ADD COLUMN "assignee_name" text;--> statement-breakpoint
ALTER TABLE "jira_issue" ADD COLUMN "requester_id" text;--> statement-breakpoint
ALTER TABLE "jira_issue" ADD COLUMN "requester_name" text;--> statement-breakpoint
CREATE INDEX "jira_issue_requester_idx" ON "jira_issue" USING btree ("requester_id");