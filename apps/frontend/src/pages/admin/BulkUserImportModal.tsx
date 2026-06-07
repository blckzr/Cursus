import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../lib/apiError';
import {
  bulkImportUsersPreview, bulkImportUsersApply,
  type BulkRawRow, type BulkPreviewResult, type BulkApplyResult,
} from '../../api';

interface Props {
  onClose: () => void;
}

/**
 * Two-step flow:
 *   1. User picks a CSV. We parse it, post to /bulk-import/preview, render a
 *      ✓/✗ row preview with the server's reasons.
 *   2. User clicks "Import N valid rows". We post the same payload to
 *      /bulk-import/apply and render a final summary.
 *
 * The CSV must have a header row; columns can be in any order. We support
 * common header aliases (email, full_name / fullName / name, role, branch,
 * program_code / programCode / program).
 */
export default function BulkUserImportModal({ onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();

  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows]   = useState<BulkRawRow[]>([]);
  const [parseErr, setParseErr] = useState('');

  const [preview, setPreview] = useState<BulkPreviewResult | null>(null);
  const [result,  setResult]  = useState<BulkApplyResult  | null>(null);

  const previewMut = useMutation({
    mutationFn: () => bulkImportUsersPreview(rawRows),
    onSuccess:  res => setPreview(res),
    onError:    (e: unknown) => toast.push({ tone: 'error', title: 'Preview failed', message: parseApiError(e).message }),
  });
  const applyMut = useMutation({
    mutationFn: () => bulkImportUsersApply(rawRows),
    onSuccess:  res => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['blocks'] });
      toast.push({
        tone:    res.failed.length > 0 ? 'info' : 'success',
        title:   `Imported ${res.created.length} user${res.created.length === 1 ? '' : 's'}`,
        message: res.failed.length > 0 ? `${res.failed.length} row${res.failed.length === 1 ? '' : 's'} skipped` : undefined,
      });
    },
    onError: (e: unknown) => toast.push({ tone: 'error', title: 'Import failed', message: parseApiError(e).message }),
  });

  const handleFile = (f: File | null) => {
    setParseErr(''); setPreview(null); setResult(null);
    if (!f) { setRawRows([]); setFileName(''); return; }
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCsv(String(reader.result ?? ''));
        if (parsed.length === 0) throw new Error('No data rows found (only the header?)');
        setRawRows(parsed);
      } catch (e) {
        setParseErr((e as Error).message ?? 'Could not parse the file.');
        setRawRows([]);
      }
    };
    reader.onerror = () => setParseErr('Failed to read the file.');
    reader.readAsText(f);
  };

  // Stage = file | preview | result. Drives which footer buttons we render.
  const stage: 'file' | 'preview' | 'result' =
    result ? 'result' : preview ? 'preview' : 'file';

  return (
    <Modal
      title="Import users from CSV"
      subtitle={stage === 'result'
        ? 'Final summary — close to return to the user list.'
        : 'Bulk-create accounts from a spreadsheet. The default password (1.PolytechnicU) is applied to every imported user.'}
      onClose={onClose}
      size="lg"
    >
      {stage === 'file' && (
        <FileStage
          fileName={fileName}
          rawRows={rawRows}
          parseErr={parseErr}
          onFile={handleFile}
          onPreview={() => previewMut.mutate()}
          previewing={previewMut.isPending}
          onClose={onClose}
        />
      )}

      {stage === 'preview' && preview && (
        <PreviewStage
          preview={preview}
          rawRows={rawRows}
          onBack={() => setPreview(null)}
          onApply={() => applyMut.mutate()}
          applying={applyMut.isPending}
          onClose={onClose}
        />
      )}

      {stage === 'result' && result && (
        <ResultStage result={result} onClose={onClose} />
      )}
    </Modal>
  );
}

// ─── Stage components ────────────────────────────────────────────────────────

function FileStage({ fileName, rawRows, parseErr, onFile, onPreview, previewing, onClose }: {
  fileName: string; rawRows: BulkRawRow[]; parseErr: string;
  onFile: (f: File | null) => void; onPreview: () => void;
  previewing: boolean; onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="label">CSV file</label>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="btn-secondary cursor-pointer inline-flex items-center gap-2">
            <Icon name="upload" size={14} />
            Choose file
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={e => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {fileName && <span className="text-xs text-stone-500 font-mono truncate">{fileName}</span>}
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`}
            download="users-import-template.csv"
            className="text-xs text-olive-600 hover:underline ml-auto flex items-center gap-1"
          >
            <Icon name="download" size={11} /> Download template
          </a>
        </div>
      </div>

      <div className="bg-beige-100 rounded-lg p-3 text-xs text-stone-700 space-y-1.5">
        <div className="flex items-start gap-2">
          <Icon name="info" size={12} className="mt-0.5 text-stone-400 flex-shrink-0" />
          <div>
            <div className="font-semibold mb-1">Required columns</div>
            <code className="font-mono bg-white border border-beige-200 rounded px-1.5 py-0.5">email</code>,&nbsp;
            <code className="font-mono bg-white border border-beige-200 rounded px-1.5 py-0.5">full_name</code>,&nbsp;
            <code className="font-mono bg-white border border-beige-200 rounded px-1.5 py-0.5">role</code> (admin/faculty/student)
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Icon name="info" size={12} className="mt-0.5 text-stone-400 flex-shrink-0" />
          <div>
            <div className="font-semibold mb-1">Optional columns</div>
            <code className="font-mono bg-white border border-beige-200 rounded px-1.5 py-0.5">branch</code> (default MN),&nbsp;
            <code className="font-mono bg-white border border-beige-200 rounded px-1.5 py-0.5">program_code</code> (required for students)
          </div>
        </div>
      </div>

      {parseErr && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{parseErr}</p>}

      {rawRows.length > 0 && (
        <div className="text-xs text-stone-500 flex items-center gap-2">
          <Icon name="check" size={12} className="text-olive-500" />
          {rawRows.length} row{rawRows.length === 1 ? '' : 's'} parsed. Click <strong>Preview</strong> to validate against the database.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={onPreview}
          disabled={previewing || rawRows.length === 0}
        >
          {previewing ? <><span className="spinner" /> Validating…</> : <><Icon name="sparkles" size={14} /> Preview</>}
        </button>
      </div>
    </div>
  );
}

function PreviewStage({ preview, rawRows, onBack, onApply, applying, onClose }: {
  preview: BulkPreviewResult; rawRows: BulkRawRow[];
  onBack: () => void; onApply: () => void; applying: boolean; onClose: () => void;
}) {
  // Merge valid + invalid back into row order so the preview reflects the
  // CSV layout the admin saw. The status is captured per row.
  type Combined = { row: BulkRawRow; status: 'ok' | 'error'; reason?: string };
  const combined = useMemo<Combined[]>(() => {
    const errors = new Map(preview.invalid.map(i => [i.rowIndex, i.reason]));
    return rawRows.map(r => ({
      row:    r,
      status: errors.has(r.rowIndex) ? 'error' : 'ok',
      reason: errors.get(r.rowIndex),
    }));
  }, [preview, rawRows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Total rows"      value={preview.summary.total} />
        <Stat label="Will create"     value={preview.summary.willCreate} tone="olive" />
        <Stat label="Skipped"         value={preview.summary.skipped} tone={preview.summary.skipped > 0 ? 'red' : undefined} />
        <Stat label="Students"        value={preview.summary.byRole.student} />
      </div>

      <div className="border border-beige-200 rounded-lg max-h-[380px] overflow-y-auto scrollable">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-beige-50 z-10">
            <tr>
              <th className="table-th !py-2 w-10">Row</th>
              <th className="table-th !py-2">Email</th>
              <th className="table-th !py-2 hidden sm:table-cell">Name</th>
              <th className="table-th !py-2 hidden md:table-cell">Role</th>
              <th className="table-th !py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {combined.map(c => (
              <tr key={c.row.rowIndex} className={c.status === 'error' ? 'bg-red-50' : ''}>
                <td className="table-td !py-1.5 text-stone-400 tabular">{c.row.rowIndex}</td>
                <td className="table-td !py-1.5 font-mono truncate max-w-[200px]" title={c.row.email}>{c.row.email}</td>
                <td className="table-td !py-1.5 hidden sm:table-cell truncate max-w-[180px]">{c.row.fullName}</td>
                <td className="table-td !py-1.5 hidden md:table-cell">{c.row.role}</td>
                <td className="table-td !py-1.5">
                  {c.status === 'ok'
                    ? <span className="text-olive-600 flex items-center gap-1"><Icon name="check" size={11} /> Ready</span>
                    : <span className="text-red-600 truncate" title={c.reason}>{c.reason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview.summary.skipped > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2">
          <Icon name="alert-triangle" size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            {preview.summary.skipped} row{preview.summary.skipped === 1 ? '' : 's'} will be skipped. Fix the source CSV and re-upload, or click Apply to create only the valid rows.
          </span>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button className="btn-ghost" onClick={onBack}>Back</button>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={onApply}
          disabled={applying || preview.summary.willCreate === 0}
        >
          {applying
            ? <><span className="spinner" /> Importing…</>
            : <><Icon name="check" size={14} /> Import {preview.summary.willCreate} valid row{preview.summary.willCreate === 1 ? '' : 's'}</>}
        </button>
      </div>
    </div>
  );
}

function ResultStage({ result, onClose }: { result: BulkApplyResult; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Created" value={result.created.length} tone="olive" />
        <Stat label="Failed"  value={result.failed.length}  tone={result.failed.length > 0 ? 'red' : undefined} />
      </div>

      {result.created.length > 0 && (
        <details className="border border-olive-100 rounded-lg" open>
          <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-olive-700 flex items-center gap-2 bg-olive-50">
            <Icon name="check" size={12} /> Created {result.created.length} user{result.created.length === 1 ? '' : 's'}
          </summary>
          <ul className="max-h-48 overflow-y-auto scrollable text-xs divide-y divide-beige-200">
            {result.created.map(c => (
              <li key={c.rowIndex} className="px-3 py-1.5 flex items-center gap-3">
                <span className="text-stone-400 tabular w-8">{c.rowIndex}</span>
                <span className="font-mono text-olive-600">{c.userCode}</span>
                <span className="text-stone-600 truncate">{c.email}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {result.failed.length > 0 && (
        <details className="border border-red-100 rounded-lg" open>
          <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-red-700 flex items-center gap-2 bg-red-50">
            <Icon name="alert-triangle" size={12} /> Failed {result.failed.length} row{result.failed.length === 1 ? '' : 's'}
          </summary>
          <ul className="max-h-48 overflow-y-auto scrollable text-xs divide-y divide-beige-200">
            {result.failed.map(f => (
              <li key={f.rowIndex} className="px-3 py-1.5 flex items-center gap-3">
                <span className="text-stone-400 tabular w-8">{f.rowIndex}</span>
                <span className="font-mono text-stone-600 truncate max-w-[200px]">{f.email}</span>
                <span className="text-red-600 text-[11px] truncate">{f.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="bg-beige-100 rounded-lg p-3 text-xs text-stone-600 flex items-start gap-2">
        <Icon name="shield" size={12} className="mt-0.5 text-stone-400 flex-shrink-0" />
        <span>All created users have the default password <span className="font-mono text-olive-600 font-semibold">1.PolytechnicU</span> and must change it on first login. Share their user codes out-of-band.</span>
      </div>

      <div className="flex justify-end pt-1">
        <button className="btn-primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'olive' | 'red' }) {
  const color = tone === 'olive' ? 'text-olive-500' : tone === 'red' ? 'text-red-500' : 'text-stone-800';
  return (
    <div className="card text-center !py-3">
      <div className={`text-2xl font-display tabular font-medium ${color}`}>{value}</div>
      <div className="text-xs text-stone-500 mt-1">{label}</div>
    </div>
  );
}

// ─── CSV parsing ─────────────────────────────────────────────────────────────

/**
 * Bare-bones CSV parser. Handles quoted fields with embedded commas and
 * escaped quotes (`""`). First non-empty line is the header row.
 *
 * Accepts these column aliases (case-insensitive, hyphen/underscore/space-tolerant):
 *   email
 *   full_name | fullname | name
 *   role
 *   branch | branch_code
 *   program_code | programcode | program
 */
function parseCsv(text: string): BulkRawRow[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(h => normHeader(h));
  const fieldIdx = (...candidates: string[]): number => {
    for (const c of candidates) {
      const i = headers.indexOf(c);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iEmail   = fieldIdx('email');
  const iName    = fieldIdx('fullname', 'name');
  const iRole    = fieldIdx('role');
  const iBranch  = fieldIdx('branch', 'branchcode');
  const iProgram = fieldIdx('programcode', 'program');

  if (iEmail === -1 || iName === -1 || iRole === -1) {
    throw new Error('Missing required column. CSV must include: email, full_name, role.');
  }

  const out: BulkRawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    out.push({
      rowIndex:    i + 1,        // 1-based, header is row 1
      email:       cells[iEmail]   ?? '',
      fullName:    cells[iName]    ?? '',
      role:        (cells[iRole]   ?? '').toLowerCase().trim(),
      branch:      iBranch  !== -1 ? cells[iBranch]  : undefined,
      programCode: iProgram !== -1 ? cells[iProgram] : undefined,
    });
  }
  return out;
}

/** Normalise a header so 'Full Name', 'full_name', 'fullName' all match. */
function normHeader(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, '').trim();
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else current += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(current); current = ''; }
      else current += c;
    }
  }
  out.push(current);
  return out.map(s => s.trim());
}

const TEMPLATE_CSV =
`email,full_name,role,branch,program_code
juan.delacruz@uni.edu,Juan Miguel dela Cruz,student,MN,BSCS
maria.reyes@uni.edu,Maria Concepcion Reyes,faculty,MN,
admin.lopez@uni.edu,Antonio Lopez,admin,MN,
`;
