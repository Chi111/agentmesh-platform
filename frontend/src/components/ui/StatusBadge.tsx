import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type StatusVariant = 'default' | 'inverted';

const toneStyles: Record<StatusVariant, Record<StatusTone, string>> = {
  default: {
    neutral: 'border-ink/10 bg-ink/[0.035] text-ink/65',
    info: 'border-cyan/30 bg-cyan/[0.08] text-cyan-700',
    success: 'border-lime/55 bg-lime/20 text-ink/80',
    warning: 'border-warning/35 bg-warning/[0.09] text-[#986614]',
    danger: 'border-danger/30 bg-danger/[0.08] text-[#aa3434]',
  },
  inverted: {
    neutral: 'border-white/15 bg-white/[0.07] text-white/70',
    info: 'border-cyan/35 bg-cyan/15 text-[#85e9f7]',
    success: 'border-lime/35 bg-lime/15 text-lime',
    warning: 'border-warning/35 bg-warning/15 text-[#ffd27f]',
    danger: 'border-danger/35 bg-danger/15 text-[#ffaaaa]',
  },
};

const dotStyles: Record<StatusVariant, Record<StatusTone, string>> = {
  default: {
    neutral: 'bg-muted/55',
    info: 'bg-cyan',
    success: 'bg-[#7cab20]',
    warning: 'bg-warning',
    danger: 'bg-danger',
  },
  inverted: {
    neutral: 'bg-white/45',
    info: 'bg-cyan',
    success: 'bg-lime',
    warning: 'bg-warning',
    danger: 'bg-danger',
  },
};

interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusTone;
  variant?: StatusVariant;
}

export function StatusBadge({ children, tone = 'neutral', variant = 'default' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,.65)] ${toneStyles[variant][tone]}`}
      data-status-badge=""
      data-tone={tone}
    >
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dotStyles[variant][tone]}`} />
      {children}
    </span>
  );
}
