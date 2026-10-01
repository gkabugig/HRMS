-- search_hr_policy is a general HR policy Q&A tool, not an HR/admin-only
-- data tool, and was caught by the first bulk admin+hr insert in migration
-- 0115 by mistake. Open it to every role; classification filtering inside
-- the retrieval function already keeps "restricted" sources HR/admin-only.
insert into ai_tool_permissions (tool_id, role, is_allowed)
select id, role, true
from ai_tool_registry, (values ('manager'), ('employee')) as r(role)
where tool_name = 'search_hr_policy'
on conflict (tool_id, role) do nothing;
