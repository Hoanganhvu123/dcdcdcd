/**
 * Report Generator Service
 * Generates downloadable DOCX, HTML, and PDF reports from AI-produced content,
 * supporting both markdown strings and institutional 2-Column A4 Financial Tear Sheet payloads.
 */

import { isSafeUrl, escapeHtml } from '@/lib/security/sanitizer';

// ── Download helper ──
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ── Source reference type ──
export interface SourceReference {
  index: number;
  title: string;
  url: string;
}

export interface ScorecardItem {
  label: string;
  value: string;
  trend?: string;
  subLabel?: string;
}

export interface WordTearSheetPayload {
  reportCode: string;
  title: string;
  subtitle: string;
  classification: string;
  author: string;
  date: string;
  rating: 'OUTPERFORM' | 'BUY' | 'HOLD' | 'CRITICAL_ALERT' | 'UNDERPERFORM' | 'SELL';
  scorecard: ScorecardItem[];
  shortTermThesis: string[];
  longTermThesis: string[];
  catalystsAndRisks: Array<{ type: 'catalyst' | 'risk'; text: string }>;
  sources: SourceReference[];
  rawMarkdown?: string;
}

// ── HTML Report Generation for Markdown ──
export function generateHtmlReport(
  markdown: string,
  metadata?: {
    title?: string;
    author?: string;
    date?: string;
    sources?: SourceReference[];
  }
): string {
  const title = escapeHtml(metadata?.title || 'AI Research Report');
  const author = escapeHtml(metadata?.author || 'OpenWork AI Analyst');
  const date = escapeHtml(metadata?.date || new Date().toLocaleDateString('vi-VN'));
  const sourcesHtml = metadata?.sources?.length
    ? `
    <div class="references">
      <h2>Nguồn tham khảo</h2>
      <ol>
        ${metadata.sources
          .map((s) => {
            const safeUrl = isSafeUrl(s.url) ? s.url : '#';
            return `<li><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.title)}</a> — <code>${escapeHtml(safeUrl)}</code></li>`;
          })
          .join('\n        ')}
      </ol>
    </div>`
    : '';

  let html = markdown
    .replace(/^### (.+)$/gm, (_, p1) => `<h3>${escapeHtml(p1)}</h3>`)
    .replace(/^## (.+)$/gm, (_, p1) => `<h2>${escapeHtml(p1)}</h2>`)
    .replace(/^# (.+)$/gm, (_, p1) => `<h1>${escapeHtml(p1)}</h1>`)
    .replace(/\*\*(.+?)\*\*/g, (_, p1) => `<strong>${escapeHtml(p1)}</strong>`)
    .replace(/\*(.+?)\*/g, (_, p1) => `<em>${escapeHtml(p1)}</em>`)
    .replace(/`(.+?)`/g, (_, p1) => `<code>${escapeHtml(p1)}</code>`)
    .replace(/^\- (.+)$/gm, (_, p1) => `<li>${escapeHtml(p1)}</li>`)
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\[(\d+)\]/g, '<sup class="cite">[$1]</sup>');
  html = `<p>${html}</p>`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #18181b; background: #fff;
      line-height: 1.7; max-width: 800px; margin: 0 auto; padding: 2rem;
    }
    .report-header {
      border-bottom: 2px solid #18181b; padding-bottom: 1.5rem; margin-bottom: 2rem;
    }
    .report-header h1 { font-size: 1.75rem; margin: 0 0 0.5rem; }
    .report-meta { font-size: 0.8125rem; color: #71717a; display: flex; gap: 2rem; }
    h2 { font-size: 1.25rem; margin-top: 2rem; border-bottom: 1px solid #e4e4e7; padding-bottom: 0.5rem; }
    h3 { font-size: 1.0625rem; margin-top: 1.5rem; }
    p { margin: 0.75rem 0; }
    ul, ol { padding-left: 1.5rem; }
    li { margin: 0.25rem 0; }
    code { background: #f4f4f5; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.8125rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; }
    th, td { border: 1px solid #e4e4e7; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f4f4f5; font-weight: 600; }
    .cite { color: #2563eb; font-size: 0.75rem; }
    .references { margin-top: 2.5rem; padding-top: 1rem; border-top: 2px solid #e4e4e7; }
    .references ol { font-size: 0.8125rem; }
    .references a { color: #2563eb; text-decoration: none; }
    .references a:hover { text-decoration: underline; }
    .report-footer {
      margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e4e4e7;
      font-size: 0.75rem; color: #a1a1aa; display: flex; justify-content: space-between;
    }
    @media print { body { padding: 0; } .report-footer { position: fixed; bottom: 0; left: 0; right: 0; } }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${title}</h1>
    <div class="report-meta">
      <span>📝 ${author}</span>
      <span>📅 ${date}</span>
    </div>
  </div>
  ${html}
  ${sourcesHtml}
  <div class="report-footer">
    <span>Generated by OpenWork AI Deep Research</span>
    <span>${date}</span>
  </div>
</body>
</html>`;
}

// ── HTML Report Generation for 2-Column A4 Financial Tear Sheet ──
export function generateTearSheetHtmlReport(payload: WordTearSheetPayload): string {
  const ratingColor =
    payload.rating === 'OUTPERFORM' || payload.rating === 'BUY'
      ? '#059669'
      : payload.rating === 'CRITICAL_ALERT'
      ? '#e11d48'
      : '#d97706';

  const scorecardHtml = payload.scorecard
    .map(
      (sc) => `
    <div class="scorecard-card">
      <div class="sc-label">${escapeHtml(sc.label)}</div>
      <div class="sc-val">${escapeHtml(sc.value)}</div>
      ${sc.trend ? `<div class="sc-trend">${escapeHtml(sc.trend)}</div>` : ''}
      ${sc.subLabel ? `<div class="sc-sub">${escapeHtml(sc.subLabel)}</div>` : ''}
    </div>`
    )
    .join('');

  const shortTermHtml = payload.shortTermThesis
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');

  const longTermHtml = payload.longTermThesis
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');

  const catalystsHtml = payload.catalystsAndRisks
    .filter((c) => c.type === 'catalyst')
    .map((c) => `<li class="cat-item">⚡ ${escapeHtml(c.text)}</li>`)
    .join('');

  const risksHtml = payload.catalystsAndRisks
    .filter((c) => c.type === 'risk')
    .map((c) => `<li class="risk-item">⚠️ ${escapeHtml(c.text)}</li>`)
    .join('');

  const sourcesHtml = payload.sources
    .map((s) => {
      const safeUrl = isSafeUrl(s.url) ? s.url : '#';
      return `<li>[${s.index}] <strong>${escapeHtml(s.title)}</strong> — <code>${escapeHtml(safeUrl)}</code></li>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(payload.title)}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #09090b; background: #fff; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 2rem;
    }
    .inst-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 2px solid #09090b; padding-bottom: 1rem; margin-bottom: 1.5rem;
    }
    .inst-left h1 { font-size: 1.5rem; margin: 0 0 0.25rem; font-weight: 800; }
    .inst-left p { font-size: 0.875rem; color: #71717a; margin: 0; }
    .inst-right { text-align: right; }
    .rating-badge {
      display: inline-block; padding: 0.35rem 0.75rem; border-radius: 4px;
      font-weight: 700; font-size: 0.8125rem; color: #fff; background: ${ratingColor};
    }
    .meta-code { font-family: monospace; font-size: 0.75rem; color: #71717a; margin-top: 0.35rem; }
    .scorecard-bar {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem;
      background: #f4f4f5; padding: 0.75rem; border-radius: 8px; margin-bottom: 1.5rem;
    }
    .scorecard-card {
      background: #fff; padding: 0.75rem; border-radius: 6px; border: 1px solid #e4e4e7;
    }
    .sc-label { font-size: 0.6875rem; text-transform: uppercase; color: #71717a; font-weight: 600; }
    .sc-val { font-size: 1.25rem; font-weight: 800; color: #09090b; margin: 0.25rem 0; }
    .sc-trend { font-size: 0.6875rem; color: #059669; font-weight: 600; }
    .sc-sub { font-size: 0.6875rem; color: #a1a1aa; }
    .two-col-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
    .col-card { border: 1px solid #e4e4e7; border-radius: 8px; padding: 1.25rem; background: #fafafa; }
    .col-title { font-size: 1rem; font-weight: 700; margin: 0 0 0.75rem; border-bottom: 1px solid #e4e4e7; padding-bottom: 0.5rem; }
    ul { padding-left: 1.25rem; margin: 0; }
    li { margin-bottom: 0.5rem; font-size: 0.8125rem; }
    .cat-item { color: #0284c7; }
    .risk-item { color: #e11d48; }
    .sources-footer {
      border-top: 2px solid #e4e4e7; padding-top: 1rem; margin-top: 1.5rem;
      font-size: 0.75rem; color: #71717a;
    }
    .sources-footer ol { padding-left: 1.25rem; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <div class="inst-header">
    <div class="inst-left">
      <h1>${escapeHtml(payload.title)}</h1>
      <p>${escapeHtml(payload.subtitle)}</p>
    </div>
    <div class="inst-right">
      <span class="rating-badge">${escapeHtml(payload.rating)}</span>
      <div class="meta-code">${escapeHtml(payload.reportCode)} • ${escapeHtml(payload.date)}</div>
    </div>
  </div>

  <div class="scorecard-bar">
    ${scorecardHtml}
  </div>

  <div class="two-col-grid">
    <div class="col-card">
      <h3 class="col-title">Luận Điểm Vận Hành Ngắn Hạn</h3>
      <ul>${shortTermHtml}</ul>
      <h3 class="col-title" style="margin-top: 1.25rem;">Xúc Tác Đột Phá (Catalysts)</h3>
      <ul>${catalystsHtml}</ul>
    </div>
    <div class="col-card">
      <h3 class="col-title">Lợi Thế Cạnh Tranh Dài Hạn</h3>
      <ul>${longTermHtml}</ul>
      <h3 class="col-title" style="margin-top: 1.25rem;">Rủi Ro Trọng Yếu</h3>
      <ul>${risksHtml}</ul>
    </div>
  </div>

  <div class="sources-footer">
    <strong>Nguồn Dữ Liệu & Chứng Thực:</strong>
    <ol>${sourcesHtml}</ol>
  </div>
</body>
</html>`;
}

/**
 * Downloads the current report as a standalone HTML file
 */
export function downloadHtmlReport(
  content: string | WordTearSheetPayload,
  metadata?: { title?: string; author?: string; date?: string; sources?: SourceReference[] }
): void {
  let html = '';
  let filename = '';

  if (typeof content === 'object' && content !== null && 'reportCode' in content) {
    html = generateTearSheetHtmlReport(content as WordTearSheetPayload);
    filename = `${(content.title || 'tear_sheet').replace(/\s+/g, '_')}.html`;
  } else {
    html = generateHtmlReport(String(content), metadata);
    filename = `${(metadata?.title || 'report').replace(/\s+/g, '_')}.html`;
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  downloadBlob(blob, filename);
}

/**
 * Downloads report as a DOCX file using the `docx` library.
 */
export async function downloadDocxReport(
  content: string | WordTearSheetPayload,
  metadata?: { title?: string; author?: string; date?: string; sources?: SourceReference[] }
): Promise<void> {
  try {
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      HeadingLevel,
      Table,
      TableRow,
      TableCell,
      WidthType,
      BorderStyle,
    } = await import('docx');

    let doc: any;
    let filename = '';

    if (typeof content === 'object' && content !== null && 'reportCode' in content) {
      const payload = content as WordTearSheetPayload;
      filename = `${(payload.title || 'tear_sheet').replace(/\s+/g, '_')}.docx`;

      const children: any[] = [];

      // Header Table
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: payload.classification, bold: true, size: 18, color: '71717a', font: 'Calibri' }),
          ],
          spacing: { after: 100 },
        })
      );

      children.push(
        new Paragraph({
          children: [new TextRun({ text: payload.title, bold: true, size: 36, font: 'Calibri' })],
          heading: HeadingLevel.TITLE,
          spacing: { after: 100 },
        })
      );

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Mã: ${payload.reportCode}  |  Đánh giá: ${payload.rating}  |  Tác giả: ${payload.author}  |  Ngày: ${payload.date}`, size: 20, font: 'Calibri', color: '2563eb', bold: true }),
          ],
          spacing: { after: 300 },
        })
      );

      // Scorecard summary table
      if (payload.scorecard && payload.scorecard.length > 0) {
        const headerCells = payload.scorecard.map((s) => new TableCell({
          children: [
            new Paragraph({ children: [new TextRun({ text: s.label, size: 16, bold: true, color: '71717a' })] }),
            new Paragraph({ children: [new TextRun({ text: s.value, size: 28, bold: true, color: '09090b' })] }),
            new Paragraph({ children: [new TextRun({ text: s.trend || '', size: 16, color: '059669', bold: true })] }),
          ],
          width: { size: Math.floor(100 / payload.scorecard.length), type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'e4e4e7' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e4e4e7' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'e4e4e7' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'e4e4e7' },
          },
        }));

        children.push(
          new Table({
            rows: [new TableRow({ children: headerCells })],
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
        children.push(new Paragraph({ spacing: { after: 300 } }));
      }

      // Short Term Thesis
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '1. Luận Điểm Vận Hành Ngắn Hạn', bold: true, size: 28, font: 'Calibri' })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
      payload.shortTermThesis.forEach((st) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: st, size: 22, font: 'Calibri' })],
            bullet: { level: 0 },
            spacing: { after: 50 },
          })
        );
      });

      // Long Term Thesis
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '2. Lợi Thế Cạnh Tranh & Luận Điểm Dài Hạn', bold: true, size: 28, font: 'Calibri' })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
      payload.longTermThesis.forEach((lt) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: lt, size: 22, font: 'Calibri' })],
            bullet: { level: 0 },
            spacing: { after: 50 },
          })
        );
      });

      // Catalysts & Risks
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '3. Xúc Tác Đột Phá & Rủi Ro Trọng Yếu', bold: true, size: 28, font: 'Calibri' })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
      payload.catalystsAndRisks.forEach((cr) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: cr.type === 'catalyst' ? '⚡ [Xúc Tác] ' : '⚠️ [Rủi Ro] ',
                bold: true,
                color: cr.type === 'catalyst' ? '0284c7' : 'e11d48',
                size: 20,
              }),
              new TextRun({ text: cr.text, size: 22, font: 'Calibri' }),
            ],
            spacing: { after: 50 },
          })
        );
      });

      // Sources
      if (payload.sources && payload.sources.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: '4. Nguồn Dữ Liệu & Kiểm Chứng', bold: true, size: 28, font: 'Calibri' })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          })
        );
        payload.sources.forEach((s) => {
          const safeUrl = isSafeUrl(s.url) ? s.url : '#';
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `[${s.index}] `, bold: true, size: 20 }),
                new TextRun({ text: s.title, size: 20 }),
                new TextRun({ text: ` — ${safeUrl}`, size: 18, color: '2563eb' }),
              ],
              spacing: { after: 50 },
            })
          );
        });
      }

      doc = new Document({
        sections: [{ properties: {}, children }],
        creator: payload.author || 'OpenWork AI',
        title: payload.title || 'Financial Tear Sheet',
      });
    } else {
      // Standard markdown parser path
      const markdown = String(content);
      filename = `${(metadata?.title || 'report').replace(/\s+/g, '_')}.docx`;
      const lines = markdown.split('\n');
      const children: any[] = [];

      children.push(
        new Paragraph({
          children: [new TextRun({ text: metadata?.title || 'AI Research Report', bold: true, size: 36, font: 'Calibri' })],
          heading: HeadingLevel.TITLE,
          spacing: { after: 200 },
        })
      );

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          children.push(new Paragraph({ spacing: { after: 100 } }));
          continue;
        }

        if (trimmed.startsWith('### ')) {
          children.push(new Paragraph({
            children: [new TextRun({ text: trimmed.slice(4), bold: true, size: 24, font: 'Calibri' })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          }));
        } else if (trimmed.startsWith('## ')) {
          children.push(new Paragraph({
            children: [new TextRun({ text: trimmed.slice(3), bold: true, size: 28, font: 'Calibri' })],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }));
        } else if (trimmed.startsWith('# ')) {
          children.push(new Paragraph({
            children: [new TextRun({ text: trimmed.slice(2), bold: true, size: 32, font: 'Calibri' })],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          }));
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          children.push(new Paragraph({
            children: [new TextRun({ text: trimmed.slice(2), size: 22, font: 'Calibri' })],
            bullet: { level: 0 },
            spacing: { after: 50 },
          }));
        } else {
          children.push(new Paragraph({
            children: [new TextRun({ text: trimmed, size: 22, font: 'Calibri' })],
            spacing: { after: 100 },
          }));
        }
      }

      doc = new Document({
        sections: [{ properties: {}, children }],
        creator: metadata?.author || 'OpenWork AI',
        title: metadata?.title || 'AI Research Report',
      });
    }

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, filename);
  } catch (err) {
    console.warn('docx library error, falling back to HTML:', err);
    downloadHtmlReport(content, metadata);
  }
}
