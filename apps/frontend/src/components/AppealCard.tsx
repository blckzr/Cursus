import { type ReactNode } from 'react';
import type { AppealRow, AppealStatus } from '../api';
import Avatar from './Avatar';
import Icon from './Icon';

const STATUS_LABEL: Record<AppealStatus, string> = {
  pending:        'Pending',
  faculty_review: 'Faculty review',
  dean_review:    "Dean's review",
  resolved:       'Resolved',
  withdrawn:      'Withdrawn',
};
const STATUS_BADGE: Record<AppealStatus, string> = {
  pending:        'badge-amber',
  faculty_review: 'badge-faculty',
  dean_review:    'badge-admin',
  resolved:       'badge-completed',
  withdrawn:      'badge-neutral',
};

interface Props {
  appeal:  AppealRow;
  /** Right-side action slot — caller wires role-specific buttons. */
  actions?: ReactNode;
  /** Show the student avatar + code header (for faculty/admin views). */
  showStudent?: boolean;
}

/**
 * Shared card for all three role views. Always shows: course/section header,
 * current vs. requested grade, the student's reason, then each role's note in
 * sequence (faculty_note, then dean_note). Actions are left to the caller.
 */
export default function AppealCard({ appeal, actions, showStudent }: Props) {
  return (
    <div className="card">
      {/* ── Top row: course + status + actions ─────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-olive-600">{appeal.course_code}</span>
            <span className="font-medium text-stone-800">{appeal.course_title}</span>
            <span className={`badge ${STATUS_BADGE[appeal.status]}`}>{STATUS_LABEL[appeal.status]}</span>
          </div>
          <div className="text-xs text-stone-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="font-mono">{appeal.section_code}</span>
            <span>·</span>
            <span>{appeal.term_name}</span>
            <span>·</span>
            <span>Filed {new Date(appeal.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>

      {/* ── Student header (faculty/admin view only) ──────────────── */}
      {showStudent && (
        <div className="flex items-center gap-3 px-3 py-2 bg-beige-50 rounded-lg mb-3">
          <Avatar name={appeal.student_name} size={28} tone="beige" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-stone-800 truncate">{appeal.student_name}</div>
            <div className="text-[10px] text-stone-400 font-mono">{appeal.student_code ?? '—'}</div>
          </div>
        </div>
      )}

      {/* ── Grade comparison ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <GradeBox label="Current grade" letter={appeal.current_letter} numeric={appeal.current_numeric} />
        <GradeBox
          label={appeal.status === 'resolved' && appeal.outcome === 'grade_changed' ? 'New grade' : 'Requested'}
          letter={appeal.resolved_grade}
          numeric={appeal.resolved_numeric}
          highlight={appeal.outcome === 'grade_changed'}
        />
      </div>

      {/* ── Reason ────────────────────────────────────────────────── */}
      <Section label="Student reason" body={appeal.reason} />

      {/* ── Faculty / dean notes ──────────────────────────────────── */}
      {appeal.faculty_note && (
        <Section
          label={`Faculty note${appeal.faculty_name ? ` · ${appeal.faculty_name}` : ''}`}
          body={appeal.faculty_note}
        />
      )}
      {appeal.dean_note && (
        <Section label="Dean note" body={appeal.dean_note} />
      )}

      {/* ── Outcome footer ────────────────────────────────────────── */}
      {appeal.status === 'resolved' && (
        <div className="mt-3 pt-3 border-t border-beige-200 text-xs text-stone-500 flex items-center gap-2">
          <Icon name="check" size={12} className="text-olive-500" />
          {appeal.outcome === 'grade_changed'
            ? <>Resolved — grade changed to <span className="font-mono font-semibold text-olive-700">{appeal.resolved_grade}</span> on {new Date(appeal.resolved_at!).toLocaleDateString()}.</>
            : <>Resolved — appeal denied on {new Date(appeal.resolved_at!).toLocaleDateString()}.</>}
        </div>
      )}
      {appeal.status === 'withdrawn' && (
        <div className="mt-3 pt-3 border-t border-beige-200 text-xs text-stone-500 flex items-center gap-2">
          <Icon name="x" size={12} />
          Withdrawn on {new Date(appeal.resolved_at!).toLocaleDateString()}.
        </div>
      )}
    </div>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold mb-1">{label}</div>
      <p className="text-sm text-stone-700 whitespace-pre-wrap bg-beige-50 rounded-lg px-3 py-2.5">{body}</p>
    </div>
  );
}

function GradeBox({ label, letter, numeric, highlight }: {
  label: string; letter: string | null; numeric: string | null; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-olive-50 border border-olive-100' : 'bg-beige-50'}`}>
      <div className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={`font-display text-xl font-medium tabular ${highlight ? 'text-olive-700' : 'text-stone-800'}`}>
          {letter ?? '—'}
        </span>
        {numeric != null && (
          <span className="text-xs text-stone-400 tabular">({Number(numeric).toFixed(2)})</span>
        )}
      </div>
    </div>
  );
}
