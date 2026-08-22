import { X } from 'lucide-react';
import { type ReactNode, useId, useLayoutEffect, useRef } from 'react';

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(512px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-white p-0 text-ink shadow-float backdrop:bg-ink/55 backdrop:backdrop-blur-sm"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <section className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold tracking-tight">
              {title}
            </h2>
            {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
          </div>
          <button type="button" className="rounded-lg p-2 text-muted transition hover:bg-canvas hover:text-ink" onClick={onClose} aria-label="关闭弹窗">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </section>
    </dialog>
  );
}
