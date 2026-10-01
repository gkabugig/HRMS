// Universal Approval Engine — conditional step rules (Area 02 spec §8).
// Approval definitions carry conditions as data, not module-specific UI
// logic: {"all": [{field, operator, value}, ...]} or {"any": [...]},
// evaluated against the metadata the caller passed to startApproval (e.g.
// {amount: 150000, department: "Finance"}). An empty/missing condition
// ({} — the column default) always matches, so an unconditional step keeps
// working with zero configuration.
export type ConditionClause = {
  field: string;
  operator: ">" | "<" | ">=" | "<=" | "==" | "!=" | "in" | "not in";
  value: unknown;
};

export type ConditionRule = { all: ConditionClause[] } | { any: ConditionClause[] } | Record<string, never>;

function evaluateClause(clause: ConditionClause, metadata: Record<string, unknown>): boolean {
  const actual = metadata[clause.field];
  switch (clause.operator) {
    case ">":
      return typeof actual === "number" && typeof clause.value === "number" && actual > clause.value;
    case "<":
      return typeof actual === "number" && typeof clause.value === "number" && actual < clause.value;
    case ">=":
      return typeof actual === "number" && typeof clause.value === "number" && actual >= clause.value;
    case "<=":
      return typeof actual === "number" && typeof clause.value === "number" && actual <= clause.value;
    case "==":
      return actual === clause.value;
    case "!=":
      return actual !== clause.value;
    case "in":
      return Array.isArray(clause.value) && clause.value.includes(actual);
    case "not in":
      return Array.isArray(clause.value) && !clause.value.includes(actual);
    default:
      return false;
  }
}

export function evaluateCondition(condition: ConditionRule, metadata: Record<string, unknown>): boolean {
  if ("all" in condition && Array.isArray(condition.all)) {
    return condition.all.every((c) => evaluateClause(c, metadata));
  }
  if ("any" in condition && Array.isArray(condition.any)) {
    return condition.any.some((c) => evaluateClause(c, metadata));
  }
  // No condition configured — the step always applies.
  return true;
}
