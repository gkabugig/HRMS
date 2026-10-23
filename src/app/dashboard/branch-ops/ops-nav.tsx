import { TabLinks } from "@/components/ui/page-kit";

export default function OpsNav({ current }: { current: string }) {
  return (
    <TabLinks
      current={current}
      items={[
        { href: "/dashboard/branch-ops", label: "Today" },
        { href: "/dashboard/branch-ops/monthly", label: "Monthly attendance" },
        { href: "/dashboard/branch-ops/settings", label: "Settings, kiosks & PINs" },
      ]}
    />
  );
}

export function NotAllowed() {
  return <p className="text-sm text-neutral-500">Branch Operations is for the owners (administrators and HR).</p>;
}
