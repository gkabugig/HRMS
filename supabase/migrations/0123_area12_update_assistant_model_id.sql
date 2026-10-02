-- The ai_assistants.model default ('claude-sonnet-4-5', set in migration
-- 0113) names a model ID that is no longer served ("404 not_found_error:
-- model: claude-sonnet-4-5"). Point both the column default (for future
-- rows) and any existing rows still on the old default at a current model
-- ID, without touching rows an admin has deliberately pointed elsewhere.
alter table ai_assistants
  alter column model set default 'claude-sonnet-5';

update ai_assistants
  set model = 'claude-sonnet-5'
  where model = 'claude-sonnet-4-5';
