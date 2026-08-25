import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="page-hero flex flex-col gap-6 pb-2 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-4xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 max-w-4xl font-display text-[2.15rem] font-bold leading-[1.08] tracking-[-0.045em] text-ink md:text-[2.85rem]">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted md:text-[15px] md:leading-7">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-3 xl:pb-1">{actions}</div> : null}
    </header>
  );
}
