import Icon from './Icon';

interface Props {
  grade: number | null | undefined;
}

/** Maps a 0–100 computed grade to an at-a-glance risk badge. */
export default function RiskPill({ grade }: Props) {
  if (grade == null) return <span className="badge badge-neutral">No data</span>;
  if (grade < 75) return <span className="badge badge-dropped"><Icon name="alert-triangle" size={10} /> At risk</span>;
  if (grade < 80) return <span className="badge badge-amber"><Icon name="info" size={10} /> Watch</span>;
  if (grade < 90) return <span className="badge badge-faculty">On track</span>;
  return <span className="badge badge-enrolled">Strong</span>;
}
