// Minimal {field} interpolation for node config strings (approval
// summaries, notification titles/messages) against the run's context_json.
// Intentionally not a templating language — just token substitution, so a
// seeded node config can never carry executable logic.
export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = context[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
