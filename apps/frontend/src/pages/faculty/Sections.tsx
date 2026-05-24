import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSections, getTerms } from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Chip from '../../components/Chip';
import FacultySectionCard from './SectionCard';

const isActive = (v: unknown) => v === true || v === 'true';

export default function FacultySections() {
  const { data: sections = [], isLoading } = useQuery({ queryKey: ['sections'], queryFn: () => getSections() });
  const { data: terms = [] } = useQuery({ queryKey: ['terms'], queryFn: () => getTerms() });

  const [termFilter, setTermFilter] = useState('active');

  const activeTerm = terms.find((t: any) => isActive(t.is_active));

  const filtered: any[] = useMemo(() => {
    if (termFilter === 'all') return sections;
    if (termFilter === 'active') return sections.filter((s: any) => s.term_name === activeTerm?.name);
    return sections.filter((s: any) => s.term_name === termFilter);
  }, [sections, termFilter, activeTerm]);

  return (
    <div>
      <PageHeader
        eyebrow="Teaching load"
        title="My sections"
        subtitle="Every section assigned to you. Click any card to open its gradebook."
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Chip active={termFilter === 'active'} onClick={() => setTermFilter('active')}>This term</Chip>
        <Chip active={termFilter === 'all'} onClick={() => setTermFilter('all')}>All</Chip>
        {terms.filter((t: any) => !isActive(t.is_active)).map((t: any) => (
          <Chip key={t.id} active={termFilter === t.name} onClick={() => setTermFilter(t.name)}>{t.name}</Chip>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-0"><EmptyState icon="school" title="No sections" message="Nothing assigned for this filter." /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(s => <FacultySectionCard key={s.id} section={s} />)}
        </div>
      )}
    </div>
  );
}
