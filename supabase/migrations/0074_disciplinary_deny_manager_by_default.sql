-- Area 06 §19/§28 — disciplinary/employee-relations data must be "deny by
-- default; explicit HR-authorized access only" and never surfaced through
-- the normal manager workspace. Live inspection ahead of building the
-- manager-safe Employee 360 projection found the opposite already shipped:
-- "disciplinary_manager_team_read" (SELECT) and "disciplinary_manager_insert"
-- (INSERT) PERMISSIVE policies gave any manager direct read/write access to
-- disciplinary_actions for their reports — pre-existing production
-- behavior from before this spec, not something introduced by Area 06. The
-- same loophole existed on the sibling disciplinary_attachments table.
-- Flagged to and confirmed with the product owner: lock this down to match
-- the spec, even though it removes an existing manager capability.
--
-- Neutralized via ALTER POLICY (always-false), not DROP POLICY (this
-- environment's migration tool cancels on DROP): the policies stay visible
-- in the catalog as a record of what used to be granted and why it was
-- turned off, rather than disappearing silently. Only admin/hr retain
-- access via the pre-existing *_hr_full policies (self-read is a
-- different, still-correct policy — an employee may see their own
-- disciplinary record — and is untouched here).
alter policy "disciplinary_manager_team_read" on disciplinary_actions
  using (false);

alter policy "disciplinary_manager_insert" on disciplinary_actions
  with check (false);

alter policy "disciplinary_attachments_manager_team_read" on disciplinary_attachments
  using (false);

alter policy "disciplinary_attachments_manager_insert" on disciplinary_attachments
  with check (false);
