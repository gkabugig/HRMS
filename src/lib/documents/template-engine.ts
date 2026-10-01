// Area 08 §22 — plain {{variable}} substitution, split out from
// generation.ts (a "use server" module, where every export must be an
// async function) since this is a pure, synchronous helper. A single
// non-evaluating regex replace — there is no template language here with
// code-eval capability, by design.
export type TemplateVariableMap = Record<string, string>;

export function substituteTemplate(body: string, variables: TemplateVariableMap): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match;
  });
}
