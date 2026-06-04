import { useState } from 'react';
import Icon from '../../components/Icon';
import RetentionReport from './RetentionReport';
import FacultyLoadReport from './FacultyLoadReport';
import SectionFillReport from './SectionFillReport';

type Tab = 'retention' | 'faculty-load' | 'section-fill';

const TABS: { key: Tab; label: string; icon: string; description: string }[] = [
  { key: 'retention',    label: 'Cohort retention', icon: 'trending-up', description: 'Entry-year cohorts vs active / graduated / inactive.' },
  { key: 'faculty-load', label: 'Faculty load',     icon: 'user-check',  description: 'Per-faculty units, hours, and overload signal for a term.' },
  { key: 'section-fill', label: 'Section fill',     icon: 'school',      description: 'Fill-rate distribution per section — spot under-enrolled offerings.' },
];

/**
 * Analytics wrapper — a thin tab container above the individual reports.
 * Each report renders its own PageHeader (with its own stats + Export button)
 * so we don't have to thread state up here. New reports drop in by adding
 * another entry to `TABS` and a `case` in the switch below.
 */
export default function Analytics() {
  const [tab, setTab] = useState<Tab>('retention');

  return (
    <div>
      {/* Tab bar — pill-shaped buttons, horizontally scrollable on mobile. */}
      <div className="-mx-3 px-3 md:mx-0 md:px-0 mb-5 overflow-x-auto scrollable">
        <div className="flex items-center gap-1.5 w-max md:w-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'bg-olive-100 text-olive-700 border border-olive-200'
                  : 'text-stone-600 hover:bg-beige-100 border border-transparent'
              }`}
              title={t.description}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'retention'    && <RetentionReport />}
      {tab === 'faculty-load' && <FacultyLoadReport />}
      {tab === 'section-fill' && <SectionFillReport />}
    </div>
  );
}
