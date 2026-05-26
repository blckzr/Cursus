import type { CSSProperties } from 'react';

interface Props {
  className?: string;
  style?: CSSProperties;
}

/** A pulsing placeholder block. Compose with width/height utility classes. */
export default function Skeleton({ className = '', style }: Props) {
  return <div className={`animate-pulse bg-beige-200/80 rounded ${className}`} style={style} />;
}
