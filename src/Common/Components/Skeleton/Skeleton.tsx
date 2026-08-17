export interface SkeletonProps {
  /** Extra CSS classes (e.g. "skeleton-line", "skeleton-title"). */
  className?: string;
  width?: string;
  height?: string;
}

export default function Skeleton({ className = "skeleton-line", width, height }: SkeletonProps) {
  return (
    <span
      className={`skeleton ${className}`.trim()}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
