interface BrandMarkProps {
  className?: string;
  label?: string;
}

export function BrandMark({ className = 'size-9', label }: BrandMarkProps) {
  return (
    <img
      src="/pinme-mesh-mark.svg"
      alt={label ?? ''}
      className={`shrink-0 ${className}`}
      draggable={false}
    />
  );
}
