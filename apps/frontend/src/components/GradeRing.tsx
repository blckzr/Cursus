interface Props {
  value: number | null;
  max?: number;
  size?: number;
  stroke?: number;
  label?: string;
}

export default function GradeRing({ value, max = 100, size = 96, stroke = 8, label }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  const color = value == null ? '#DDD0AD'
    : value >= 90 ? '#6B8030'
    : value >= 80 ? '#8FA857'
    : value >= 75 ? '#B09A65'
    : '#dc2626';
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="grade-ring">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#F0E8D4" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xl font-semibold tabular text-stone-800 leading-none">
          {value == null ? '—' : value.toFixed(1)}
        </div>
        {label && <div className="text-[10px] text-stone-400 uppercase tracking-wider mt-1">{label}</div>}
      </div>
    </div>
  );
}
