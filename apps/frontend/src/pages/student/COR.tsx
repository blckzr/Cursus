import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCor, downloadCor,
  getPendingEnrollment, confirmEnrollment,
  type PendingEnrollmentPayload,
} from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';

interface CorSubject {
  enrollment_id: string;
  section_id:    string;
  course_code:   string;
  course_title:  string;
  units:         number;
  section_code:  string;
  day_of_week:   string | null;
  start_time:    string | null;
  end_time:      string | null;
  room:          string | null;
  faculty_name:  string | null;
}

interface CorPayload {
  student: {
    user_code:    string | null;
    full_name:    string;
    program_code: string | null;
    program_name: string | null;
    year_level:   number | null;
    block_label:  string | null;
  };
  term: {
    name:      string;
    semester:  string;
    startDate: string;
    endDate:   string;
  };
  subjects:   CorSubject[];
  totalUnits: number;
}

const SEM_LABEL: Record<string, string> = {
  '1':    '1st Semester',
  '2':    '2nd Semester',
  summer: 'Summer Term',
};

export default function StudentCor() {
  const toast = useToast();
  const qc = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);

  const { data, isLoading, isError } = useQuery<CorPayload>({
    queryKey: ['cor'],
    queryFn:  getCor,
    retry:    false,                 // a 404 is a normal state, not a transient failure
  });

  // Pending-enrollment side-channel. Returns null when there's nothing
  // pending, so the banner stays hidden in the steady state.
  const { data: pending } = useQuery<PendingEnrollmentPayload | null>({
    queryKey: ['pending-enrollment'],
    queryFn:  getPendingEnrollment,
    retry:    false,
  });

  const confirmMut = useMutation({
    mutationFn: () => confirmEnrollment(),
    onSuccess:  res => {
      qc.invalidateQueries({ queryKey: ['cor'] });
      qc.invalidateQueries({ queryKey: ['pending-enrollment'] });
      qc.invalidateQueries({ queryKey: ['student-grades'] });          // schedule + grades pull from here
      qc.invalidateQueries({ queryKey: ['notifications'] });
      setShowConfirm(false);
      toast.push({
        tone:    'success',
        title:   `Enrolled in ${res.confirmed} section${res.confirmed === 1 ? '' : 's'}`,
        message: res.termName ? `Welcome to ${res.termName}.` : undefined,
      });
    },
    onError: (e: unknown) => toast.push({
      tone: 'error', title: 'Could not confirm', message: parseApiError(e).message,
    }),
  });

  const handleDownload = async () => {
    try {
      await downloadCor();
      toast.push({ tone: 'success', title: 'COR downloaded' });
    } catch {
      toast.push({ tone: 'error', title: 'Download failed', message: 'Try again in a moment.' });
    }
  };

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-32 rounded-xl mt-5" />
        <Skeleton className="h-64 rounded-xl mt-3" />
      </div>
    );
  }

  // ── Empty / error state ──────────────────────────────────────────────────
  // If COR is empty but the student has pending sections, surface the same
  // confirm prompt — the COR will populate the moment they confirm.
  if (isError || !data) {
    return (
      <div>
        <PageHeader
          eyebrow="Registrar"
          title="Certificate of Registration"
          subtitle="Your current-semester registration certificate."
        />
        {pending ? (
          <ConfirmBanner pending={pending} onConfirm={() => setShowConfirm(true)} />
        ) : (
          <div className="card p-0">
            <EmptyState
              icon="clipboard-list"
              title="No active registration"
              message="Your COR will appear here once the registrar opens a term and you have at least one enrolled subject."
            />
          </div>
        )}
        {showConfirm && pending && (
          <ConfirmModal
            pending={pending}
            onClose={() => setShowConfirm(false)}
            onConfirm={() => confirmMut.mutate()}
            submitting={confirmMut.isPending}
          />
        )}
      </div>
    );
  }

  const { student, term, subjects, totalUnits } = data;

  return (
    <div>
      <PageHeader
        eyebrow="Registrar"
        title="Certificate of Registration"
        subtitle={`${term.name} · ${SEM_LABEL[term.semester] ?? term.semester}`}
        action={
          <button onClick={handleDownload} className="btn-primary flex items-center gap-2">
            <Icon name="download" size={14} />
            <span className="hidden sm:inline">Download PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
        }
      />

      {/* Pending banner — appears when there are sections still waiting to be
          confirmed for the active term. Most students will see this once at
          the start of each semester. */}
      {pending && (
        <div className="mb-4">
          <ConfirmBanner pending={pending} onConfirm={() => setShowConfirm(true)} />
        </div>
      )}

      {/* Student info card — mirrors the PDF's beige info block */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <Field label="Student name"   value={student.full_name} />
          <Field
            label="Program"
            value={student.program_code
              ? `${student.program_code} — ${student.program_name ?? ''}`.trim()
              : '—'}
          />
          <Field label="Student number" value={student.user_code ?? '—'} mono />
          <Field
            label="Year & Block"
            value={student.block_label
              ? `${student.block_label}  ·  Year ${student.year_level ?? '—'}`
              : `Year ${student.year_level ?? '—'}`}
          />
        </div>
      </div>

      {/* Subjects table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-th">Code</th>
                <th className="table-th">Course title</th>
                <th className="table-th text-center" style={{ width: 60 }}>Units</th>
                <th className="table-th hidden sm:table-cell">Section</th>
                <th className="table-th">Schedule</th>
                <th className="table-th hidden md:table-cell">Room</th>
                <th className="table-th hidden lg:table-cell">Faculty</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map(s => (
                <tr key={s.enrollment_id} className="hover:bg-beige-50 transition-colors">
                  <td className="table-td font-mono text-xs font-semibold text-olive-600">{s.course_code}</td>
                  <td className="table-td">{s.course_title}</td>
                  <td className="table-td text-center tabular">{s.units}</td>
                  <td className="table-td font-mono text-stone-500 text-xs hidden sm:table-cell">{s.section_code}</td>
                  <td className="table-td text-stone-600 text-xs whitespace-nowrap">
                    {s.day_of_week
                      ? <><span className="font-mono">{s.day_of_week}</span> · {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</>
                      : <span className="badge badge-amber"><Icon name="alert-triangle" size={10} /> TBA</span>}
                  </td>
                  <td className="table-td text-stone-500 hidden md:table-cell">{s.room ?? '—'}</td>
                  <td className="table-td text-stone-500 hidden lg:table-cell">{s.faculty_name ?? 'TBA'}</td>
                </tr>
              ))}
              {/* Totals */}
              <tr className="bg-olive-50 font-semibold">
                <td className="table-td" colSpan={2}>
                  <span className="text-olive-700 uppercase tracking-wider text-xs">Total units</span>
                </td>
                <td className="table-td text-center tabular text-olive-700">{totalUnits}</td>
                <td className="table-td hidden sm:table-cell" colSpan={1}></td>
                <td className="table-td"></td>
                <td className="table-td hidden md:table-cell"></td>
                <td className="table-td hidden lg:table-cell"></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-beige-200 bg-beige-50 text-xs text-stone-500 flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-1.5">
            <Icon name="info" size={12} />
            This is a preview. Download the PDF for the official document.
          </span>
          <span className="tabular">{subjects.length} subject{subjects.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {showConfirm && pending && (
        <ConfirmModal
          pending={pending}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => confirmMut.mutate()}
          submitting={confirmMut.isPending}
        />
      )}
    </div>
  );
}

// ── Small bits ───────────────────────────────────────────────────────────────

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">{label}</div>
      <div className={`mt-1 text-sm font-medium text-stone-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

// ── Pending-enrollment banner + modal ────────────────────────────────────────

function ConfirmBanner({ pending, onConfirm }: {
  pending: PendingEnrollmentPayload; onConfirm: () => void;
}) {
  return (
    <div className="card !p-0 overflow-hidden border-olive-200 ring-2 ring-olive-100">
      <div className="bg-gradient-to-r from-olive-50 to-beige-50 px-4 py-3 flex items-center gap-3 border-b border-olive-100">
        <span className="w-9 h-9 rounded-lg bg-olive-100 text-olive-600 flex items-center justify-center flex-shrink-0">
          <Icon name="sparkles" size={17} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-800">
            Confirm your enrollment for {pending.term.name}
          </div>
          <div className="text-xs text-stone-500 mt-0.5">
            The registrar has registered you for {pending.subjects.length} subject{pending.subjects.length === 1 ? '' : 's'} ({pending.totalUnits} units).
            Confirm to attend — until you do, your schedule and grades stay locked.
          </div>
        </div>
        <button onClick={onConfirm} className="btn-primary flex items-center gap-2 flex-shrink-0">
          <Icon name="check" size={14} />
          <span className="hidden sm:inline">Confirm enrollment</span>
          <span className="sm:hidden">Confirm</span>
        </button>
      </div>
    </div>
  );
}

function ConfirmModal({ pending, onClose, onConfirm, submitting }: {
  pending: PendingEnrollmentPayload;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Modal
      title="Confirm enrollment"
      subtitle={`You're about to enlist for ${pending.term.name}. After you confirm, your faculty and schedule unlock.`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        <div className="bg-beige-100 rounded-lg px-3 py-2.5 text-xs text-stone-600 flex items-start gap-2">
          <Icon name="info" size={12} className="mt-0.5 text-stone-400 flex-shrink-0" />
          <span>
            By confirming, you're telling the registrar you're attending this semester.
            If a subject is wrong, contact the registrar before confirming —
            after confirmation, drops go through the formal request flow.
          </span>
        </div>

        <div className="border border-beige-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-beige-50">
              <tr>
                <th className="table-th !py-2">Code</th>
                <th className="table-th !py-2">Course</th>
                <th className="table-th !py-2 text-center">Units</th>
                <th className="table-th !py-2 hidden sm:table-cell">Schedule</th>
              </tr>
            </thead>
            <tbody>
              {pending.subjects.map(s => (
                <tr key={s.enrollment_id}>
                  <td className="table-td !py-1.5 font-mono text-xs font-semibold text-olive-600">{s.course_code}</td>
                  <td className="table-td !py-1.5 truncate">{s.course_title}</td>
                  <td className="table-td !py-1.5 text-center tabular">{s.units}</td>
                  <td className="table-td !py-1.5 text-stone-600 text-xs hidden sm:table-cell whitespace-nowrap">
                    {s.day_of_week
                      ? <><span className="font-mono">{s.day_of_week}</span> · {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</>
                      : <span className="badge badge-amber"><Icon name="alert-triangle" size={10} /> TBA</span>}
                  </td>
                </tr>
              ))}
              <tr className="bg-olive-50 font-semibold">
                <td className="table-td !py-1.5" colSpan={2}>
                  <span className="text-olive-700 uppercase tracking-wider text-xs">Total units</span>
                </td>
                <td className="table-td !py-1.5 text-center tabular text-olive-700">{pending.totalUnits}</td>
                <td className="table-td !py-1.5 hidden sm:table-cell"></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary flex items-center gap-2" onClick={onConfirm} disabled={submitting}>
            {submitting
              ? <><span className="spinner" /> Confirming…</>
              : <><Icon name="check" size={14} /> Yes, I'm attending</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
