/**
 * Certificate of Registration (COR) renderer.
 *
 * Layout: A4 landscape, single page. School header → student info block →
 * subjects table → totals + footer. Uses pdfkit's built-in fonts only so we
 * don't have to ship .ttf files with the backend bundle.
 */
import PDFDocument from 'pdfkit';

const SEM_LABEL: Record<string, string> = {
  '1':     '1st Semester',
  '2':     '2nd Semester',
  summer: 'Summer Term',
};

// Cursus brand colours (matches the frontend olive / beige palette).
const OLIVE = '#6B8030';
const BEIGE = '#F5EFE0';
const STONE = '#3a342c';
const GREY  = '#5b544a';
const FAINT = '#998c66';

export interface CorPayload {
  student: {
    user_code:        string | null;
    full_name:        string;
    program_code:     string | null;
    program_name:     string | null;
    year_level:       number | null;
    block_label:      string | null;
  };
  term: {
    name:      string;
    semester:  string;
    startDate: string;
    endDate:   string;
  };
  subjects: Array<{
    course_code:  string;
    course_title: string;
    units:        number;
    section_code: string;
    meetings:     Array<{ dayOfWeek: string; startTime: string; endTime: string }>;
    room:         string | null;
    faculty_name: string | null;
  }>;
  totalUnits: number;
  issuedAt:   Date;
}

/** Returns a Buffer containing the rendered PDF. */
export function renderCorPdf(data: CorPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size:   'A4',
      layout: 'landscape',
      margin: 36,                  // ~0.5 inch
      info: {
        Title:    `Certificate of Registration — ${data.student.full_name}`,
        Author:   'Cursus · Universidad Mariana',
        Subject:  'Certificate of Registration',
        Creator:  'Cursus SIS',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, data);
    drawStudentBlock(doc, data);
    drawSubjectTable(doc, data);
    drawFooter(doc, data);

    doc.end();
  });
}

// ─── Sections ────────────────────────────────────────────────────────────────

function drawHeader(doc: PDFKit.PDFDocument, data: CorPayload): void {
  const top = doc.y;

  // Olive band
  doc.rect(36, top, doc.page.width - 72, 56).fill(OLIVE);

  // School name
  doc.fillColor('white').font('Helvetica-Bold').fontSize(15)
    .text('UNIVERSIDAD MARIANA', 48, top + 12, { align: 'left' });
  doc.font('Helvetica').fontSize(9)
    .text('Office of the Registrar · Marawoy, Lipa City', 48, top + 32);

  // Document title — right side
  doc.font('Helvetica-Bold').fontSize(13)
    .text('CERTIFICATE OF REGISTRATION', 48, top + 16, {
      align: 'right',
      width: doc.page.width - 96,
    });
  doc.font('Helvetica').fontSize(9)
    .text(`${data.term.name} · ${SEM_LABEL[data.term.semester] ?? data.term.semester}`, 48, top + 34, {
      align: 'right',
      width: doc.page.width - 96,
    });

  doc.fillColor(STONE);
  doc.y = top + 56 + 14;
}

function drawStudentBlock(doc: PDFKit.PDFDocument, data: CorPayload): void {
  const top   = doc.y;
  const left  = 36;
  const width = doc.page.width - 72;

  // Soft beige card
  doc.roundedRect(left, top, width, 56, 6).fill(BEIGE).stroke(BEIGE);
  doc.fillColor(STONE);

  // Two columns of name/value pairs
  const colWidth = width / 2 - 12;

  // ── Left column ─────────────────────────────────────────────────────────
  let y = top + 9;
  field(doc, left + 12,           y, colWidth, 'Student name', data.student.full_name);
  y += 24;
  field(doc, left + 12,           y, colWidth, 'Student number', data.student.user_code ?? '—');

  // ── Right column ────────────────────────────────────────────────────────
  y = top + 9;
  const rightCol = left + width / 2;
  const program = data.student.program_code
    ? `${data.student.program_code} — ${data.student.program_name ?? ''}`.trim()
    : '—';
  field(doc, rightCol + 12,        y, colWidth, 'Program', program);
  y += 24;
  const block = data.student.block_label
    ? `${data.student.block_label}  (Year ${data.student.year_level ?? '—'})`
    : `Year ${data.student.year_level ?? '—'}`;
  field(doc, rightCol + 12,        y, colWidth, 'Year & Block', block);

  doc.y = top + 56 + 14;
}

function field(doc: PDFKit.PDFDocument, x: number, y: number, w: number, label: string, value: string) {
  doc.font('Helvetica').fontSize(7).fillColor(FAINT)
    .text(label.toUpperCase(), x, y, { width: w, characterSpacing: 1.2 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(STONE)
    .text(value, x, y + 9, { width: w, ellipsis: true });
}

function drawSubjectTable(doc: PDFKit.PDFDocument, data: CorPayload): void {
  const left  = 36;
  const width = doc.page.width - 72;
  const top   = doc.y;

  // Column widths sum to `width`. Tuned for landscape A4 (~770 pt usable).
  const cols = [
    { key: 'code',     label: 'Code',         w:  78 },
    { key: 'title',    label: 'Course title', w: 230 },
    { key: 'units',    label: 'Units',        w:  40, align: 'center' as const },
    { key: 'section',  label: 'Section',      w:  85 },
    { key: 'schedule', label: 'Schedule',     w: 130 },
    { key: 'room',     label: 'Room',         w:  60 },
    { key: 'faculty',  label: 'Faculty',      w: 147 },
  ];

  // Header row
  const headerHeight = 22;
  doc.rect(left, top, width, headerHeight).fill(OLIVE);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
  let x = left;
  for (const c of cols) {
    doc.text(c.label, x + 6, top + 7, { width: c.w - 12, align: c.align ?? 'left' });
    x += c.w;
  }
  doc.fillColor(STONE);

  // Body rows
  let y = top + headerHeight;
  const rowHeight = 22;
  doc.font('Helvetica').fontSize(9);

  for (let i = 0; i < data.subjects.length; i++) {
    const s = data.subjects[i];

    // Zebra stripe
    if (i % 2 === 1) {
      doc.rect(left, y, width, rowHeight).fill(BEIGE).fillColor(STONE);
    }

    const sched = s.meetings && s.meetings.length > 0
      ? s.meetings.map(m => `${m.dayOfWeek} ${m.startTime}–${m.endTime}`).join('; ')
      : 'TBA';

    const values: string[] = [
      s.course_code,
      s.course_title,
      String(s.units),
      s.section_code,
      sched,
      s.room ?? '—',
      s.faculty_name ?? 'TBA',
    ];

    x = left;
    for (let j = 0; j < cols.length; j++) {
      const c = cols[j];
      const v = values[j];
      doc.fillColor(STONE).font(c.key === 'code' ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .text(v, x + 6, y + 6, { width: c.w - 12, height: rowHeight - 8, ellipsis: true, align: c.align ?? 'left' });
      x += c.w;
    }
    y += rowHeight;
  }

  // Total units row
  doc.rect(left, y, width, rowHeight).fillAndStroke(OLIVE, OLIVE);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(10)
    .text('TOTAL UNITS', left + 6, y + 6, { width: 308 + 78, align: 'right' })
    .text(String(data.totalUnits), left + 6 + 308 + 78, y + 6, { width: 40, align: 'center' });
  y += rowHeight;

  doc.y = y + 18;
}

function drawFooter(doc: PDFKit.PDFDocument, data: CorPayload): void {
  const top   = doc.y;
  const left  = 36;
  const width = doc.page.width - 72;

  doc.fillColor(GREY).font('Helvetica').fontSize(8);

  // Issued date — left aligned
  const issuedStr = data.issuedAt.toLocaleString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
  doc.text(`Issued on ${issuedStr}`, left, top);

  // Term range — centred
  const start = new Date(data.term.startDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  const end   = new Date(data.term.endDate).toLocaleDateString('en-PH',   { year: 'numeric', month: 'short', day: 'numeric' });
  doc.text(`Term coverage: ${start} – ${end}`, left, top, { width, align: 'center' });

  // Validity note — right aligned
  doc.text('This document is system-generated and serves as proof of registration.',
    left, top, { width, align: 'right' });

  // Signature line at the bottom of the page
  const sigY = doc.page.height - 80;
  doc.moveTo(doc.page.width - 36 - 220, sigY).lineTo(doc.page.width - 36, sigY).stroke(FAINT);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(STONE)
    .text('Registrar', doc.page.width - 36 - 220, sigY + 4, { width: 220, align: 'center' });
  doc.font('Helvetica').fontSize(7).fillColor(FAINT)
    .text('Office of the Registrar · Universidad Mariana',
      doc.page.width - 36 - 220, sigY + 17, { width: 220, align: 'center' });
}
