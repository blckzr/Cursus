interface Props {
  name?: string;
  size?: number;
  tone?: 'olive' | 'khaki' | 'beige';
}

export default function Avatar({ name, size = 32, tone = 'beige' }: Props) {
  const initials = (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map(s => s[0])
    .join('')
    .toUpperCase();
  const palette = tone === 'olive' ? 'bg-olive-300 text-white'
    : tone === 'khaki' ? 'bg-khaki-300 text-stone-700'
    : 'bg-beige-300 text-stone-700';
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${palette}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {initials}
    </div>
  );
}
