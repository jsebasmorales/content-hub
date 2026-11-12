-- "Lo aprendido" is the Leader's own page (D-061). New databases already create the Colaborador role
-- without that section, but a database created earlier (production, since 2026-11-11) wrote the
-- default grants once, when the role was first made, with every section. Nothing re-runs that, so
-- without this the page would stay visible to collaborators there. There is no screen yet where a
-- Leader edits a role's grants, so no deliberate choice can be overwritten.
UPDATE role_permission
SET granted = false
WHERE permission_key = 'section.learn'
  AND role_id IN (SELECT id FROM role WHERE name = 'Colaborador' AND is_system);
--> statement-breakpoint
-- The runtime role (scripts/create-runtime-role.mjs) receives UPDATE and DELETE on every new table by
-- default. learned_entry is append-only (D-061): the trigger from 0005 already refuses those, and this
-- takes the privileges away as well, so a mistake would have to get past two locks. Skipped where the
-- role does not exist (local and test databases).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON learned_entry FROM app_runtime;
  END IF;
END
$$;
