import type { RecruitmentSnapshot as RecruitmentSnapshotData } from "@/lib/dashboard/dashboard-types";
import { VerticalBars } from "@/components/charts/charts";
import ChartCard from "./chart-card";

export default function RecruitmentSnapshotCard({ recruitment }: { recruitment: RecruitmentSnapshotData }) {
  const href = "/dashboard/recruitment";
  const items = [
    { label: "Open roles", value: recruitment.openPositions },
    { label: "Candidates", value: recruitment.candidates },
    { label: "Screening", value: recruitment.screening },
    { label: "Interviews", value: recruitment.interviews },
    { label: "Offers", value: recruitment.offers },
    { label: "Hires", value: recruitment.hires },
  ].map((i) => ({ ...i, href }));
  return (
    <ChartCard title="Recruitment" subtitle="Pipeline at a glance" href={href} linkLabel="Recruitment" accent="var(--vivid-2)">
      {recruitment.openPositions === 0 ? (
        <p className="text-sm text-neutral-400 dark:text-neutral-500 py-6 text-center">No open positions.</p>
      ) : (
        <VerticalBars items={items} palette="vivid" multicolor compact height={110} />
      )}
    </ChartCard>
  );
}
