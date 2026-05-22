const legendItems = [
  { label: "Interested", tone: "bg-emerald-500" },
  { label: "Not Interested", tone: "bg-blue-500" },
  { label: "Disposed / Completed", tone: "bg-violet-500" },
  { label: "Failed / Not connected", tone: "bg-rose-500" },
  { label: "No activity", tone: "bg-slate-300 dark:bg-slate-600" },
];

export function StatusLegend() {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        Status legend
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {legendItems.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
