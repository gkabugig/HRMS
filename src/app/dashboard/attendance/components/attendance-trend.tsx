export function AttendanceTrend({ trend }: { trend: { date: string; present: number; late: number; absent: number }[] }) {
  const max = Math.max(1, ...trend.map((t) => t.present + t.absent));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-sm shadow-slate-900/[0.03] p-4">
      <h2 className="text-sm font-semibold text-neutral-900 mb-3">7-day trend</h2>
      <div className="flex items-end gap-2 h-28">
        {trend.map((t) => {
          const presentH = Math.round((t.present / max) * 100);
          const absentH = Math.round((t.absent / max) * 100);
          return (
            <div key={t.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end h-20 gap-0.5">
                {absentH > 0 && <div className="w-full bg-red-200 rounded-t" style={{ height: `${absentH}%` }} title={`${t.absent} absent`} />}
                <div className="w-full bg-brand-400 rounded-t" style={{ height: `${presentH}%` }} title={`${t.present} present (${t.late} late)`} />
              </div>
              <span className="text-[9px] text-neutral-400">{new Date(t.date).toLocaleDateString("en-KE", { weekday: "narrow" })}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-neutral-400 mt-2">Bars: present (indigo, includes late) over absent (red). Hover a bar for exact counts.</p>
    </div>
  );
}
