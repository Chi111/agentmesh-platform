import type { LucideIcon } from 'lucide-react';

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  signal = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  signal?: 'neutral' | 'cyan' | 'lime';
}) {
  const iconStyle = signal === 'cyan' ? 'bg-cyan/10 text-cyan' : signal === 'lime' ? 'bg-lime/20 text-ink' : 'bg-canvas text-muted';

  return (
    <article className="panel metric-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
          <p className="metric-value">{value}</p>
          <p className="mt-2 text-xs text-muted">{detail}</p>
        </div>
        <span className={`flex size-10 items-center justify-center rounded-xl ${iconStyle}`}>
          <Icon size={19} aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}
