-- Performance advisor: ai_tool_registry_authenticated_read /
-- ai_tool_permissions_authenticated_read re-evaluated auth.role() per row.
-- Wrap in (select ...) per the same fix pattern as migration 0108.
alter policy ai_tool_registry_authenticated_read on ai_tool_registry using ((select auth.role()) = 'authenticated');
alter policy ai_tool_permissions_authenticated_read on ai_tool_permissions using ((select auth.role()) = 'authenticated');
