interface EnergyBarProps {
  value: number; // 0-100
  className?: string;
  showValue?: boolean;
}

export function EnergyBar({ value, className = '', showValue = false }: EnergyBarProps) {
  const safe = Number.isFinite(value) ? value : 0;
  const clamped = Math.max(0, Math.min(100, safe));
  // Color shifts from zinc (inactive) through emerald to green as energy grows
  const barColor =
    clamped === 0
      ? 'bg-zinc-700'
      : clamped < 25
        ? 'bg-gradient-to-r from-emerald-700 to-emerald-500'
        : clamped < 50
          ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
          : clamped < 75
            ? 'bg-gradient-to-r from-emerald-500 to-emerald-300'
            : 'bg-gradient-to-r from-emerald-400 to-green-300';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showValue && (
        <span className="w-7 text-right text-xs tabular-nums text-zinc-500">{clamped}</span>
      )}
    </div>
  );
}
