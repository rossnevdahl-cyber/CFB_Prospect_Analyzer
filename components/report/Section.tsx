export function Section({ id, title, children, aside }: { id: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function DataTable<T>({ cols, rows, empty = "No data." }: { cols: { label: string; get: (r: T) => string; align?: "left" | "right" }[]; rows: T[]; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.label} className={c.align === "right" ? "text-right" : "text-left"}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c.label} className={c.align === "right" ? "text-right" : "text-left"}>
                  {c.get(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TIER_COLORS: Record<string, string> = {
  Elite: "bg-emerald-600 text-white",
  Starter: "bg-blue-600 text-white",
  Flex: "bg-violet-600 text-white",
  Dart: "bg-amber-500 text-white",
};

export function TierPill({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return <span className={`pill ${TIER_COLORS[tier] ?? "bg-gray-500 text-white"}`}>{tier}</span>;
}
