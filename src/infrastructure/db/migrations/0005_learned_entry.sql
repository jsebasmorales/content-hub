CREATE TABLE "learned_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quarter_year" integer NOT NULL,
	"quarter_number" integer NOT NULL,
	"conclusions" text DEFAULT '' NOT NULL,
	"next_focus" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learned_entry_quarter_valid" CHECK ("learned_entry"."quarter_number" between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "learned_entry" ADD CONSTRAINT "learned_entry_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learned_entry_quarter_idx" ON "learned_entry" USING btree ("quarter_year","quarter_number","created_at");
--> statement-breakpoint
-- learned_entry is append-only (D-061): a save adds a version, it never rewrites or removes one.
CREATE FUNCTION learned_entry_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'learned_entry is append-only (% not allowed)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER learned_entry_no_update_delete
  BEFORE UPDATE OR DELETE ON learned_entry
  FOR EACH ROW EXECUTE FUNCTION learned_entry_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER learned_entry_no_truncate
  BEFORE TRUNCATE ON learned_entry
  FOR EACH STATEMENT EXECUTE FUNCTION learned_entry_reject_mutation();
