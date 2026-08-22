import type { ReactNode } from 'react';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneStyles: Record<Tone, string> = {
  neutral: 'border-line bg-canvas text-muted',
  info: 'border-cyan/25 bg-cyan/10 text-cyan-700',
  success: 'border-lime/50 bg-lime/15 text-ink',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
};

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneStyles[tone]}`}>
      {children}
    </span>
  );
}
