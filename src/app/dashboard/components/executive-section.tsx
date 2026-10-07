import type { ExecutiveInsights } from "@/lib/dashboard/dashboard-types";
import { Doughnut, VerticalBars } from "@/components/charts/charts";
import ChartCard from "./chart-card";
import { StatCard, StatGrid } from "./role-home";

// Organisation-wide extras for the head of organisation: what is waiting for
// a decision, how full the establishment is, what payroll costs, and where
// risk is building. Everything here is read-only and links to its source tab.
export default function ExecutiveSection({ insights }: { insights: ExecutiveInsights }) {
  const { establishment: est, dataQuality: dq } = insights;
  const fillPct = est.approvedSeats > 0 ? Math.round((est.filledSeats / est.approvedSeats) * 100) : null;
  const seatItems = [
    { label: "Filled", value: est.filledSeats, color: "var(--vivid-3)", href: "/dashboard/organogram" },
    { label: "Vacant", value: est.vacantSeats, color: "var(--vivid-4)", href: "/dashboard/recruitment" },
  ];
  const money = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n));

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Executive view</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Decisions waiting, establishment, payroll cost and risk across the whole organisation.</p>
      </div>

      <StatGrid>
        <StatCard
          index={0}
          label="Awaiting decision"
          value={insights.pendingApprovalsTotal}
          note={insights.oldestApprovalDays !== null ? `Oldest waiting ${insights.oldestApprovalDays} day(s)` : "Nothing waiting"}
          noteTone={insights.pendingApprovalsTotal > 0 ? "warn" : "good"}
          href="/dashboard/approvals"
        />
        <StatCard
          index={1}
          label="Establishment filled"
          value={fillPct !== null ? `${fillPct}%` : "—"}
          note={`${est.vacantSeats} vacant of ${est.approvedSeats} seats`}
          href="/dashboard/organogram"
        />
        <StatCard
          index={2}
          label="Open disciplinary cases"
          value={insights.openDisciplinaryCases}
          note="Without an outcome yet"
          noteTone={insights.openDisciplinaryCases > 0 ? "warn" : "good"}
          href="/dashboard/disciplinary"
        />
        <StatCard
          index={3}
          label="Data-quality findings"
          value={dq.total}
          note={dq.high > 0 ? `${dq.high} high priority` : dq.total > 0 ? "None high priority" : "All clear"}
          noteTone={dq.high > 0 ? "warn" : "good"}
          href="/dashboard/organogram"
        />
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Waiting for a decision" subtitle="Pending approvals by type" href="/dashboard/approvals" linkLabel="Approvals" accent="var(--vivid-2)">
          {insights.pendingApprovalsByType.length === 0 ? (
            <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">No approvals waiting.</p>
          ) : (
            <VerticalBars
              items={insights.pendingApprovalsByType.map((i) => ({ ...i, href: "/dashboard/approvals" }))}
              palette="vivid"
              multicolor
              compact
              format="int"
              height={160}
            />
          )}
          {insights.pendingLeaveRequests > 0 && <p className="text-[11px] text-amber-600 mt-2">{insights.pendingLeaveRequests} leave request(s) pending</p>}
        </ChartCard>

        <ChartCard title="Establishment" subtitle="Approved seats, filled vs vacant" href="/dashboard/organogram" linkLabel="Organogram" accent="var(--vivid-3)">
          {est.approvedSeats === 0 ? (
            <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">No positions set up yet.</p>
          ) : (
            <Doughnut items={seatItems} palette="vivid" centreLabel="seats" />
          )}
        </ChartCard>
      </div>

      {insights.payrollTrend.length > 0 && (
        <ChartCard title="Payroll cost" subtitle="Gross pay, last runs (KES)" href="/dashboard/payroll" linkLabel="Payroll" accent="var(--vivid-1)">
          <VerticalBars
            items={insights.payrollTrend.map((p) => ({ ...p, href: "/dashboard/payroll" }))}
            palette="vivid"
            multicolor
            format="int"
            height={170}
            valueLabel={money}
          />
        </ChartCard>
      )}
    </section>
  );
}
