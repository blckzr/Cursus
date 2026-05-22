interface Props {
  value: number;
  max?: number;
  color?: string;
  height?: number;
}

export default function ProgressBar({ value, max = 100, color = '#6B8030', height = 6 }: Props) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="w-full bg-beige-200 rounded-full overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct * 100}%`, background: color }}
      />
    </div>
  );
}
