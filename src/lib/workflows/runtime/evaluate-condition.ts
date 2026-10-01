// Trigger/condition-node matching (Area 03 spec §12) deliberately reuses
// the exact same rule shape and evaluator Area 02 already built for
// approval-step conditions ({"all"|"any": [{field, operator, value}]}, {}
// always matches) — one condition engine, not two independently-maintained
// copies that quietly drift apart.
export { evaluateCondition } from "@/lib/approvals/evaluate-condition";
export type { ConditionRule, ConditionClause } from "@/lib/approvals/evaluate-condition";
