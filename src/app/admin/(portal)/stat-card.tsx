// Small presentational tile used across the platform screens.
export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="app-panel-muted p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-[-0.02em] text-slate-950">
        {value}
      </p>
    </div>
  );
}
