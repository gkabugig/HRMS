import type { SupabaseClient } from "@supabase/supabase-js";

// Area 09 §13 Template Engine.
//
// Templates are data, not code: substitution is a single non-evaluating
// regex replace over `{{dotted.path}}` tokens against a flat variable
// bag, exactly the same primitive Area 08's generation.ts uses for
// document templates (see template-engine.ts there) — no JS `eval`, no
// SQL, no shell, nothing resembling an expression language. Output is
// HTML-escaped by default; callers that need the plain-text form (SMS,
// push) ask for `escape: false` explicitly.
export type TemplateVariableMap = Record<string, unknown>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTemplateString(template: string, variables: TemplateVariableMap, escape = true): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, variables);
    if (value === undefined || value === null) return "";
    const str = String(value);
    return escape ? escapeHtml(str) : str;
  });
}

// Validates the variable bag against a template's declared JSON schema
// before the template is marked active. This is a lightweight structural
// check (required keys + primitive types), not a full JSON Schema
// implementation — sufficient for catching "this template references a
// variable the event never provides" at authoring time, which is the
// actual risk spec §13 calls out ("validate variables against a JSON
// schema before activation").
export function validateVariablesAgainstSchema(
  variables: TemplateVariableMap,
  schema: { required?: string[]; properties?: Record<string, { type?: string }> }
): string[] {
  const errors: string[] = [];
  for (const key of schema.required ?? []) {
    if (!(key in variables) || variables[key] === undefined || variables[key] === null) {
      errors.push(`Missing required variable: ${key}`);
    }
  }
  if (schema.properties) {
    for (const [key, def] of Object.entries(schema.properties)) {
      if (!(key in variables) || !def.type) continue;
      const actual = typeof variables[key];
      const expected = def.type === "integer" ? "number" : def.type;
      if (expected && actual !== expected && variables[key] !== null) {
        errors.push(`Variable ${key} expected ${def.type}, got ${actual}`);
      }
    }
  }
  return errors;
}

export type ResolvedTemplate = {
  templateId: string | null;
  title: string;
  body: string;
  safePreview: string | null;
  actionLabel: string | null;
  actionUrl: string | null;
};

// Locale fallback chain (§13): user locale → organisation default → en-KE.
// A template row is looked up per (org, event_type, channel, locale);
// if none exists at the requested locale this walks down the chain and,
// failing all of that, falls back to a minimal built-in default so the
// pipeline never breaks just because HR hasn't authored a template yet.
export async function resolveTemplate(
  supabase: SupabaseClient,
  orgId: string,
  eventType: string,
  channel: string,
  userLocale: string | null,
  orgDefaultLocale: string,
  variables: TemplateVariableMap
): Promise<ResolvedTemplate> {
  const localeChain = [userLocale, orgDefaultLocale, "en-KE"].filter(
    (l, i, arr): l is string => !!l && arr.indexOf(l) === i
  );

  for (const locale of localeChain) {
    const { data } = await supabase
      .from("notification_templates")
      .select("id, subject_template, body_template, safe_preview_template, action_label_template, action_url_template, variables_schema, first_used_at")
      .eq("org_id", orgId)
      .eq("event_type", eventType)
      .eq("channel", channel)
      .eq("locale", locale)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      if (!data.first_used_at) {
        await supabase.from("notification_templates").update({ first_used_at: new Date().toISOString() }).eq("id", data.id);
      }
      return {
        templateId: data.id,
        title: renderTemplateString(data.subject_template ?? "", variables),
        body: renderTemplateString(data.body_template, variables),
        safePreview: data.safe_preview_template ? renderTemplateString(data.safe_preview_template, variables, false) : null,
        actionLabel: data.action_label_template ? renderTemplateString(data.action_label_template, variables, false) : null,
        actionUrl: data.action_url_template ? renderTemplateString(data.action_url_template, variables, false) : null,
      };
    }
  }

  return {
    templateId: null,
    title: String(variables.defaultTitle ?? "HRMS notification"),
    body: String(variables.defaultMessage ?? "You have a new HRMS notification. Sign in to review it."),
    safePreview: "You have a new HRMS notification. Sign in to review it.",
    actionLabel: "Open HRMS",
    actionUrl: typeof variables.defaultActionUrl === "string" ? variables.defaultActionUrl : null,
  };
}

// §13 "Support template preview using synthetic data only." Used by the
// admin template editor's preview pane — never real employee data.
export const SYNTHETIC_PREVIEW_VARIABLES: TemplateVariableMap = {
  employee: { name: "Jane Sample", id: "00000000-0000-0000-0000-000000000000" },
  task: { title: "Sample task", id: "00000000-0000-0000-0000-000000000000" },
  document: { title: "Sample Document", id: "00000000-0000-0000-0000-000000000000" },
  request: { id: "00000000-0000-0000-0000-000000000000", type: "Sample Request" },
  case: { subject: "Sample case", id: "00000000-0000-0000-0000-000000000000" },
  org: { name: "Sample Organisation" },
};
