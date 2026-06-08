/**
 * Certificate of Graduation PDF.
 *
 * Per spec (FUTURE_FEATURES 8.7 / alumni portal): transcript-style — every
 * subject the student ever finalized, grouped by term, with units + grade +
 * a final GWA. Computed exactly like PH norm: weighted by units across all
 * finalized enrollments INCLUDING failures.
 */
import PDFDocument from 'pdfkit';

const OLIVE = '#6B8030';
const BEIGE = '#F5EFE0';
const STONE = '#3a342c';
const GREY  = '#5b544a';
const FAINT = '#998c66';

const SEM_LABEL: Record<string, string> = {
  '1': '1st Semester', '2': '2nd Semester', summer: 'Summer Term',
};

export interface CertificatePayload {
  student: {
    user_code:    string | null;
    full_name:    string;
    program_code: string | null;
    program_name: string | null;
    graduated_at: string;          // ISO
  };
  terms: Array<{
    name:     string;
    semester: string;
    enrollments: Array<{
      course_code:   string;
      course_title:  string;
      units:         number;
      letter_grade:  string | null;
      numeric_grade: number | null;
    }>;
  }>;
  totalUnits:   number;
  finalGwa:     number | null;
  issuedAt:     Date;
}

export function renderCertificatePdf(data: CertificatePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'portrait', margin: 48,
      info: {
        Title:  `Certificate of Graduation — ${data.student.full_name}`,
        Author: 'Cursus · Universidad Mariana',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const L = doc.page.margins.left;

    // ── Header ───────────────────────────────────────────────
    doc.rect(L, doc.page.margins.top, W, 60).fill(OLIVE);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(20)
       .text('UNIVERSIDAD MARIANA', L + 16, doc.page.margins.top + 10, { width: W - 32 });
    doc.font('Helvetica').fontSize(11)
       .text('Office of the Registrar · Certificate of Graduation', L + 16, doc.page.margins.top + 36);

    doc.fillColor(STONE);
    let y = doc.page.margins.top + 80;

    // ── Salutation ──────────────────────────────────────────
    doc.font('Helvetica').fontSize(11).fillColor(GREY)
       .text('This is to certify that', L, y, { width: W, align: 'center' });
    y += 18;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(STONE)
       .text(data.student.full_name.toUpperCase(), L, y, { width: W, align: 'center' });
    y += 26;
    doc.font('Helvetica').fontSize(10).fillColor(GREY)
       .text(`Student ID: ${data.student.user_code ?? '—'}`, L, y, { width: W, align: 'center' });
    y += 14;
    doc.text(
      `has successfully completed the requirements of the ${data.student.program_name ?? ''} (${data.student.program_code ?? ''}) program,`,
      L, y, { width: W, align: 'center' },
    );
    y += 14;
    doc.text(
      `and was conferred the degree on ${new Date(data.student.graduated_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}.`,
      L, y, { width: W, align: 'center' },
    );
    y += 28;

    // ── Final GWA ───────────────────────────────────────────
    const gwaBoxH = 50;
    doc.roundedRect(L + W / 2 - 90, y, 180, gwaBoxH, 8).fill(BEIGE);
    doc.fillColor(STONE).font('Helvetica').fontSize(9)
       .text('FINAL GWA (weighted by units)', L + W / 2 - 90, y + 8, { width: 180, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(22).fillColor(OLIVE)
       .text(data.finalGwa != null ? data.finalGwa.toFixed(2) : '—', L + W / 2 - 90, y + 22, { width: 180, align: 'center' });
    doc.fillColor(STONE);
    y += gwaBoxH + 24;

    // ── Per-term transcript ─────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(11).fillColor(STONE)
       .text('Academic Record', L, y);
    y += 16;

    const cols = [
      { label: 'CODE',   w: 70 },
      { label: 'COURSE', w: W - 70 - 50 - 60 - 60 },
      { label: 'UNITS',  w: 50, align: 'center' as const },
      { label: 'GRADE',  w: 60, align: 'center' as const },
      { label: '%',      w: 60, align: 'center' as const },
    ];

    for (const t of data.terms) {
      // Page-break if we're near the bottom
      if (y > doc.page.height - doc.page.margins.bottom - 100) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      // Term header
      doc.fillColor(OLIVE).font('Helvetica-Bold').fontSize(10)
         .text(`${t.name} — ${SEM_LABEL[t.semester] ?? t.semester}`, L, y);
      y += 14;

      // Column header
      doc.rect(L, y, W, 16).fill(OLIVE);
      doc.fillColor('white').font('Helvetica-Bold').fontSize(8);
      let x = L;
      for (const c of cols) {
        doc.text(c.label, x + 6, y + 5, { width: c.w - 12, align: c.align ?? 'left' });
        x += c.w;
      }
      y += 16;
      doc.fillColor(STONE).font('Helvetica').fontSize(9);

      for (let i = 0; i < t.enrollments.length; i++) {
        const e = t.enrollments[i];
        if (i % 2 === 1) {
          doc.rect(L, y, W, 16).fill(BEIGE).fillColor(STONE);
        }
        const vals: string[] = [
          e.course_code,
          e.course_title,
          String(e.units),
          e.letter_grade ?? '—',
          e.numeric_grade != null ? Number(e.numeric_grade).toFixed(2) : '—',
        ];
        let x2 = L;
        for (let ci = 0; ci < cols.length; ci++) {
          const c = cols[ci];
          doc.text(vals[ci], x2 + 6, y + 4, { width: c.w - 12, align: c.align ?? 'left' });
          x2 += c.w;
        }
        y += 16;

        if (y > doc.page.height - doc.page.margins.bottom - 24) {
          doc.addPage();
          y = doc.page.margins.top;
        }
      }
      y += 6;
    }

    // ── Footer ──────────────────────────────────────────────
    if (y > doc.page.height - doc.page.margins.bottom - 80) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y += 12;
    doc.font('Helvetica').fontSize(8).fillColor(FAINT)
       .text(`Total units earned: ${data.totalUnits}`, L, y);
    y += 12;
    doc.text(`Issued ${data.issuedAt.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}.`, L, y);
    y += 24;
    doc.fillColor(STONE).font('Helvetica-Oblique').fontSize(8)
       .text('This certificate is a computer-generated record. For certifications bearing official signatures and seals, contact the Office of the Registrar.',
        L, y, { width: W, align: 'center' });

    doc.end();
  });
}
