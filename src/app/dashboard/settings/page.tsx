import { createClient } from "@/lib/supabase/server";
import { updateRates } from "./actions";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: rates } = await supabase
    .from("statutory_rates")
    .select("*")
    .eq("org_id", DEFAULT_ORG_ID)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-neutral-900">Settings — Statutory Rates</h1>
      <p className="text-sm text-neutral-500">
        Saving creates a new rate row effective today — past payslips keep using the rates that
        were active when they were generated.
      </p>

      <form action={updateRates} className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4 space-y-4 text-sm">
        <div>
          <label className="block text-neutral-700 mb-1">PAYE bands (JSON)</label>
          <textarea
            name="paye_bands"
            rows={4}
            defaultValue={JSON.stringify(rates?.paye_bands ?? [], null, 2)}
            className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2 font-mono text-xs"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Personal relief" name="personal_relief" defaultValue={rates?.personal_relief} />
          <Field label="NSSF Tier 1 ceiling" name="nssf_tier1_ceiling" defaultValue={rates?.nssf_tier1_ceiling} />
          <Field label="NSSF Tier 2 ceiling" name="nssf_tier2_ceiling" defaultValue={rates?.nssf_tier2_ceiling} />
          <Field label="NSSF rate" name="nssf_rate" step="0.0001" defaultValue={rates?.nssf_rate} />
          <Field label="SHIF rate" name="shif_rate" step="0.0001" defaultValue={rates?.shif_rate} />
          <Field label="SHIF minimum" name="shif_min" defaultValue={rates?.shif_min} />
          <Field label="Housing levy rate" name="housing_levy_rate" step="0.0001" defaultValue={rates?.housing_levy_rate} />
        </div>
        <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors py-2 px-4 font-medium">
          Save rates
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  step = "0.01",
}: {
  label: string;
  name: string;
  defaultValue?: number | null;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-neutral-700 mb-1">{label}</label>
      <input
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue ?? undefined}
        className="w-full border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors px-3 py-2"
      />
    </div>
  );
}
