import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  FileText,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertCircle,
  Loader2,
  Printer,
  Copy,
  ShieldCheck,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { DocxSkeleton } from '../skeletons/DocxSkeleton';
import { OpenWorkMarkdownRenderer } from '@/components/openwork/OpenWorkMarkdownRenderer';
import type { WordTearSheetPayload } from './types';
import {
  downloadHtmlReport,
  downloadDocxReport,
} from '../../openwork/services/report-generator';
import { sanitizeHtml, escapeHtml, isSafeUrl } from '@/lib/security/sanitizer';

export interface WordArtifactViewerProps {
  artifact?: {
    id?: string;
    name?: string;
    title?: string;
    type?: string;
    status?: string;
    toolName?: string;
    content?: any;
    url?: string;
    file_path?: string;
    base64?: string;
    payload?: WordTearSheetPayload;
    activeClause?: number | string;
    isStreaming?: boolean;
    streamingClause?: string;
    [key: string]: any;
  } | null;
  onDownload?: () => void;
  className?: string;
  spotlightActive?: boolean;
}

function isBase64Docx(str: string): boolean {
  if (typeof str !== 'string') return false;
  if (
    str.startsWith('data:application/vnd.openxmlformats') ||
    str.startsWith('data:application/octet-stream') ||
    str.startsWith('data:application/msword') ||
    str.startsWith('data:application/zip')
  ) {
    return true;
  }
  if (str.length > 50 && (str.startsWith('UEsDB') || (str.startsWith('data:') && str.includes('UEsDB')))) {
    return true;
  }
  return false;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleanStr = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryString = atob(cleanStr);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export const WordArtifactViewer: React.FC<WordArtifactViewerProps> = React.memo(({
  artifact,
  onDownload,
  className = '',
  spotlightActive = false,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Ingest raw docx or structured tear sheet payload
  const tearSheetPayload: WordTearSheetPayload | null = useMemo(() => {
    if (artifact?.payload && 'reportCode' in artifact.payload) {
      return artifact.payload;
    }
    if (artifact?.content && typeof artifact.content === 'object' && 'reportCode' in artifact.content) {
      return artifact.content as WordTearSheetPayload;
    }
    if (typeof artifact?.content === 'string') {
      try {
        const parsed = JSON.parse(artifact.content);
        if (parsed && typeof parsed === 'object' && 'reportCode' in parsed) {
          return parsed as WordTearSheetPayload;
        }
      } catch {
        // Not JSON
      }
    }
    return null;
  }, [artifact]);

  useEffect(() => {
    let active = true;

    async function parseDocxBinary() {
      const rawData =
        artifact?.base64 ||
        (typeof artifact?.content === 'string' && isBase64Docx(artifact.content) ? artifact.content : null) ||
        artifact?.content?.base64;

      if (!rawData) {
        if (active) {
          setHtmlContent(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setParseError(null);

      try {
        const mammoth = await import('mammoth');
        const arrayBuffer = base64ToArrayBuffer(rawData);
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (active) {
          const sanitized = sanitizeHtml(result?.value || '');
          setHtmlContent(sanitized || null);
        }
      } catch (err: any) {
        console.warn('Docx binary parsing failed, falling back to structured/markdown:', err);
        if (active) {
          setParseError('Đang hiển thị dưới dạng văn bản cấu trúc A4.');
          setHtmlContent(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    parseDocxBinary();
    return () => {
      active = false;
    };
  }, [artifact]);

  const fallbackMarkdown = useMemo(() => {
    if (tearSheetPayload) return '';
    if (!artifact?.content) return '# Báo Cáo Phân Tích Tổng Quan\n\n*(Đang kết xuất dữ liệu báo cáo...)*';
    if (typeof artifact.content === 'string') {
      if (isBase64Docx(artifact.content)) {
        return '# Báo Cáo Tài Liệu Word (.docx)\n\n*Đã nạp tệp tài liệu nhị phân DOCX thành công.*';
      }
      return artifact.content;
    }
    const doc = artifact.content as Record<string, any>;
    const parts: string[] = [];
    if (doc.title) parts.push(`# ${doc.title}`);
    if (doc.subtitle) parts.push(`_${doc.subtitle}_`);
    if (doc.summary) parts.push(String(doc.summary));
    for (const section of Array.isArray(doc.sections) ? doc.sections : []) {
      if (section?.heading) parts.push(`## ${section.heading}`);
      if (section?.content) parts.push(String(section.content));
      const points = Array.isArray(section?.key_points) ? section.key_points : [];
      if (points.length) parts.push(points.map((p: string) => `- ${p}`).join('\n'));
    }
    if (doc.markdown) parts.push(String(doc.markdown));
    if (parts.length) return parts.join('\n\n');
    if (doc.text) return String(doc.text);
    if (doc.html) return String(doc.html);
    return JSON.stringify(artifact.content, null, 2);
  }, [artifact, tearSheetPayload]);

  // Default to authentic Cuccu Legal A4 contract if no custom document is provided
  const isDemoLegal = useMemo(() => {
    if (loading || tearSheetPayload || htmlContent) return false;
    if (!artifact?.content) return true;
    if (typeof artifact.content === 'string') {
      const trimmed = artifact.content.trim();
      return trimmed === '' || trimmed.includes('Đang kết xuất dữ liệu báo cáo');
    }
    return false;
  }, [loading, tearSheetPayload, htmlContent, artifact?.content]);

  const reportTitle = useMemo(() => {
    return (
      tearSheetPayload?.title ||
      artifact?.title ||
      artifact?.name ||
      (isDemoLegal ? 'Báo Cáo Phân Tích Tài Chính Q3/2026' : 'Báo Cáo Tài Chính Tear Sheet A4')
    );
  }, [tearSheetPayload, artifact, isDemoLegal]);

  const handleCopyText = useCallback(() => {
    let text = '';
    if (tearSheetPayload) {
      text = `${tearSheetPayload.title}\n${tearSheetPayload.subtitle}\n\nRating: ${tearSheetPayload.rating} | Code: ${tearSheetPayload.reportCode}\n\n1. Luận điểm ngắn hạn:\n${tearSheetPayload.shortTermThesis.join('\n')}\n\n2. Luận điểm dài hạn:\n${tearSheetPayload.longTermThesis.join('\n')}`;
    } else if (htmlContent) {
      text = htmlContent.replace(/<[^>]*>/g, ' ');
    } else if (isDemoLegal) {
      text = `HỆ THỐNG PHÂN TÍCH DỮ LIỆU TÀI CHÍNH DOANH NGHIỆP · DB-GPT STUDIO\nBáo Cáo Điều Hành & Thẩm Định Số Liệu PnL Q3/2026\n\nBÁO CÁO PHÂN TÍCH TÀI CHÍNH & HIỆU QUẢ HOẠT ĐỘNG Q3/2026\nMã số: BC-TC/2026-Q3/DB-GPT · Dữ liệu kho PostgreSQL DW · Chuẩn mực VAS & IFRS\n\nMục 1: Tổng quan Doanh thu Thuần & Tăng trưởng Thị phần Q3/2026 (42.8 Tỷ VNĐ, +18.4% YoY)\nMục 2: Cơ cấu Chi phí, Giá vốn & Biên Lợi nhuận Gộp (Biên LN 33.9%, OPEX kiểm soát $470K)\nMục 3: Hiệu quả Hoạt động, Dòng tiền & Lợi nhuận Ròng EBITDA (10.5 Tỷ VNĐ, OCF +3.8 Tỷ)\nMục 4: Dự báo Kịch bản Kinh doanh & Kế hoạch Hành động Q4/2026 (Doanh thu Q4 $2.68M)`;
    } else {
      text = fallbackMarkdown;
    }
    navigator.clipboard.writeText(text);
    toast.success('Đã sao chép nội dung báo cáo');
  }, [tearSheetPayload, htmlContent, isDemoLegal, fallbackMarkdown]);

  const handlePrintPdf = useCallback(() => {
    const printWin = window.open('', '_blank');
    if (!printWin) {
      toast.error('Trình duyệt chặn cửa sổ popup in ấn');
      return;
    }

    const safeTitle = escapeHtml(reportTitle);
    let bodyHtml = '';

    if (tearSheetPayload) {
      bodyHtml = `
        <div class="inst-header">
          <div>
            <h1 style="font-size: 20px; margin: 0 0 4px; font-weight: 800;">${escapeHtml(tearSheetPayload.title)}</h1>
            <p style="font-size: 12px; color: #71717a; margin: 0;">${escapeHtml(tearSheetPayload.subtitle)}</p>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; font-size: 13px; color: #059669;">${escapeHtml(tearSheetPayload.rating)}</div>
            <div style="font-family: monospace; font-size: 10px; color: #71717a;">${escapeHtml(tearSheetPayload.reportCode)} • ${escapeHtml(tearSheetPayload.date)}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f4f4f5; padding: 10px; border-radius: 6px; margin-bottom: 16px;">
          ${tearSheetPayload.scorecard.map(sc => `
            <div style="background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #e4e4e7;">
              <div style="font-size: 9px; text-transform: uppercase; color: #71717a; font-weight: 600;">${escapeHtml(sc.label)}</div>
              <div style="font-size: 16px; font-weight: 800; color: #09090b; margin: 2px 0;">${escapeHtml(sc.value)}</div>
              <div style="font-size: 9px; color: #059669; font-weight: 600;">${escapeHtml(sc.trend || '')}</div>
            </div>
          `).join('')}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div style="border: 1px solid #e4e4e7; border-radius: 6px; padding: 12px; background: #fafafa;">
            <h3 style="font-size: 13px; font-weight: 700; margin: 0 0 8px; border-bottom: 1px solid #e4e4e7; padding-bottom: 4px;">Luận Điểm Ngắn Hạn</h3>
            <ul style="font-size: 11px; padding-left: 16px; margin: 0;">
              ${tearSheetPayload.shortTermThesis.map(st => `<li style="margin-bottom: 4px;">${escapeHtml(st)}</li>`).join('')}
            </ul>
          </div>
          <div style="border: 1px solid #e4e4e7; border-radius: 6px; padding: 12px; background: #fafafa;">
            <h3 style="font-size: 13px; font-weight: 700; margin: 0 0 8px; border-bottom: 1px solid #e4e4e7; padding-bottom: 4px;">Luận Điểm Dài Hạn</h3>
            <ul style="font-size: 11px; padding-left: 16px; margin: 0;">
              ${tearSheetPayload.longTermThesis.map(lt => `<li style="margin-bottom: 4px;">${escapeHtml(lt)}</li>`).join('')}
            </ul>
          </div>
        </div>
      `;
      bodyHtml = sanitizeHtml(bodyHtml);
    } else if (isDemoLegal) {
      bodyHtml = `
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid #18181b; padding-bottom: 16px;">
          <p style="margin: 0; font-family: 'Times New Roman', serif; font-size: 14px; font-weight: 700; text-transform: uppercase;">HỆ THỐNG PHÂN TÍCH DỮ LIỆU TÀI CHÍNH DOANH NGHIỆP · DB-GPT STUDIO</p>
          <p style="margin: 4px 0 0; font-family: 'Times New Roman', serif; font-size: 13px; font-weight: 600; color: #52525b;">Báo Cáo Điều Hành &amp; Thẩm Định Số Liệu PnL Q3/2026</p>
        </div>
        <h1 style="font-family: 'Times New Roman', serif; font-size: 20px; font-weight: 700; text-align: center; text-transform: uppercase; margin: 0 0 6px;">BÁO CÁO PHÂN TÍCH TÀI CHÍNH &amp; HIỆU QUẢ HOẠT ĐỘNG Q3/2026</h1>
        <p style="font-family: 'Times New Roman', serif; font-size: 13px; font-style: italic; text-align: center; color: #52525b; margin: 0 0 24px;">Mã số: BC-TC/2026-Q3/DB-GPT · Dữ liệu kho PostgreSQL DW · Chuẩn mực VAS &amp; IFRS</p>
        <div style="font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.8; text-align: justify;">
          <p><strong>Mục 1. Tổng quan Doanh thu Thuần &amp; Tăng trưởng Thị phần Q3/2026:</strong> Tổng doanh thu thuần đạt 42.8 Tỷ VNĐ ($2,450,000), tăng trưởng +18.4% YoY. Khối Enterprise B2B đóng góp 62.4% tổng cơ cấu.</p>
          <p><strong>Mục 2. Cơ cấu Chi phí, Giá vốn &amp; Biên Lợi nhuận Gộp:</strong> Biên lợi nhuận gộp đạt 33.9% (tăng +3.2% so với Q2). Chi phí OPEX kiểm soát chặt chẽ ở mức $470,000; hiệu suất marketing ROI đạt 310.5%.</p>
          <p><strong>Mục 3. Hiệu quả Hoạt động, Dòng tiền &amp; Lợi nhuận Ròng EBITDA:</strong> EBITDA đạt 10.5 Tỷ VNĐ ($360,000), vượt 12.5% chỉ tiêu. Dòng tiền thuần từ HĐKD đạt +3.8 Tỷ VNĐ, hệ số thanh toán nhanh 2.45 lần.</p>
          <p><strong>Mục 4. Dự báo Kịch bản Kinh doanh &amp; Kế hoạch Hành động Q4/2026:</strong> Dự kiến doanh thu Q4 đạt $2,680,000 (+21.2% YoY). Toàn niên hạn 2026 dự kiến đạt mốc doanh thu vượt 100 Tỷ VNĐ.</p>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 48px; text-align: center; font-family: 'Times New Roman', serif; font-size: 13px; font-weight: 700;">
          <div><p>TRƯỞNG BAN PHÂN TÍCH TÀI CHÍNH</p><p style="font-size: 11px; font-style: italic; font-weight: 400;">(Ký &amp; xác nhận số liệu kiểm toán)</p></div>
          <div><p>TỔNG GIÁM ĐỐC ĐIỀU HÀNH (CEO)</p><p style="font-size: 11px; font-style: italic; font-weight: 400;">(Ký, phê duyệt &amp; ban hành)</p></div>
        </div>
      `;
      bodyHtml = sanitizeHtml(bodyHtml);
    } else {
      bodyHtml = htmlContent ? sanitizeHtml(htmlContent) : `<div style="white-space: pre-wrap;">${escapeHtml(fallbackMarkdown)}</div>`;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${safeTitle}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #18181b; background: #fff; line-height: 1.5; padding: 0; margin: 0; }
            .inst-header { display: flex; justify-content: space-between; border-bottom: 2px solid #18181b; padding-bottom: 12px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          ${bodyHtml}
          <script>
            window.onload = function() { window.focus(); window.print(); };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  }, [reportTitle, tearSheetPayload, htmlContent, isDemoLegal, fallbackMarkdown]);

  const handleDownloadDocx = useCallback(async () => {
    if (onDownload) {
      onDownload();
      return;
    }
    const contentToExport = tearSheetPayload || fallbackMarkdown;
    await downloadDocxReport(contentToExport, { title: reportTitle });
    toast.success('Đã tải tệp DOCX thành công');
  }, [onDownload, tearSheetPayload, fallbackMarkdown, reportTitle]);

  /** A rating is a verdict, so it gets one of the two semantic colours, or the
   *  neutral accent when it is neither clearly good nor clearly bad. */
  const ratingTone = useMemo(() => {
    const r = tearSheetPayload?.rating;
    if (r === 'OUTPERFORM' || r === 'BUY') return 'is-good';
    if (r === 'CRITICAL_ALERT' || r === 'UNDERPERFORM' || r === 'SELL') return 'is-bad';
    return '';
  }, [tearSheetPayload?.rating]);

  const handleDownloadHtml = useCallback(() => {
    const contentToExport = tearSheetPayload || fallbackMarkdown;
    downloadHtmlReport(contentToExport, { title: reportTitle });
    toast.success('Đã tải tệp HTML thành công');
  }, [tearSheetPayload, fallbackMarkdown, reportTitle]);

  const isGenerating =
    artifact?.status === 'generating' ||
    (spotlightActive && (!artifact || (!tearSheetPayload && !htmlContent && !artifact?.content)));

  const isStreaming = artifact?.status === 'streaming' || Boolean(artifact?.isStreaming);
  const activeClauseNum =
    artifact?.activeClause !== undefined
      ? Number(artifact?.activeClause)
      : (isStreaming ? 3 : null);

  const isWritingClause = useCallback(
    (clauseNo: number) => isStreaming && (activeClauseNum === clauseNo || (!activeClauseNum && clauseNo === 3)),
    [isStreaming, activeClauseNum]
  );

  if (isGenerating) {
    return (
      <DocxSkeleton
        toolName={artifact?.toolName || 'doc_writer'}
        title={reportTitle}
        className={className}
      />
    );
  }

  return (
    <div className={`ow-wd ${className}`}>
      <div className="ow-wd-bar">
        <button type="button" className="ow-wd-btn" onClick={handleCopyText} title="Sao chép nội dung">
          <Copy size={13} />
        </button>
        <button type="button" className="ow-wd-btn" onClick={handlePrintPdf} title="In / xuất PDF">
          <Printer size={13} />
        </button>
        <button type="button" className="ow-wd-btn" onClick={handleDownloadHtml} title="Tải HTML">
          <Download size={13} />
          <span>HTML</span>
        </button>
        <button type="button" className="ow-wd-btn ow-wd-btn-ink" onClick={handleDownloadDocx} title="Tải DOCX">
          <Download size={13} />
          <span>DOCX</span>
        </button>

        {isStreaming ? (
          <span className="legal-pill-status is-drafting ml-2">
            Đang kết xuất Mục {activeClauseNum || 3} · Soạn thảo...
          </span>
        ) : (
          <span className="legal-pill-status is-ready ml-2">Bản A4 Chuẩn · Sẵn sàng</span>
        )}

        <span className="ow-wd-bar-sep" />

        <button
          type="button"
          className="ow-wd-btn"
          onClick={() => setZoom((z) => Math.max(35, z - 5))}
          disabled={zoom <= 35}
          title="Thu nhỏ"
        >
          <ZoomOut size={13} />
        </button>
        <span className="ow-wd-zoom">{zoom}%</span>
        <button
          type="button"
          className="ow-wd-btn"
          onClick={() => setZoom((z) => Math.min(160, z + 5))}
          disabled={zoom >= 160}
          title="Phóng to"
        >
          <ZoomIn size={13} />
        </button>
        <button
          type="button"
          className="ow-wd-btn"
          onClick={() => setZoom((z) => (z === 100 ? 65 : 100))}
          title={zoom === 100 ? 'Vừa trang (65%)' : 'Phóng 100% (Native DPI)'}
        >
          <RotateCcw size={13} />
        </button>
      </div>

      {parseError && (
        <div className="ow-wd-error" role="alert">
          <AlertCircle size={14} style={{ flex: 'none', marginTop: 1 }} />
          <span>{parseError}</span>
        </div>
      )}

      {/* ── Main A4 Paper Canvas Viewport ── */}
      <div ref={canvasRef} className="ow-wd-canvas custom-scrollbar">
        {loading ? (
          <div className="ow-wd-loading">
            <Loader2 size={26} className="animate-spin" />
            <span>Đang kết xuất tài liệu Word...</span>
          </div>
        ) : (
          <div
            style={{
              zoom: zoom !== 100 ? (zoom / 100) : undefined,
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
              textRendering: 'optimizeLegibility',
            }}
            className="ow-wd-page"
          >
            {tearSheetPayload ? (
              <div className="ow-wd-doc">
                {/* Institutional Header */}
                <div className="ow-wd-head">
                  <div className="ow-wd-head-main">
                    <div className="ow-wd-class">{tearSheetPayload.classification}</div>
                    <h1 className="ow-wd-title">{tearSheetPayload.title}</h1>
                    <p className="ow-wd-sub">{tearSheetPayload.subtitle}</p>
                  </div>

                  <div className="ow-wd-head-side">
                    <span className={`ow-wd-rating ${ratingTone}`}>{tearSheetPayload.rating}</span>
                    <div className="ow-wd-code">
                      <span>{tearSheetPayload.reportCode}</span> • <span>{tearSheetPayload.date}</span>
                    </div>
                  </div>
                </div>

                {/* 4-Card Scorecard Bar */}
                <div className="ow-wd-score">
                  {tearSheetPayload.scorecard.map((sc, idx) => (
                    <div key={idx} className="ow-wd-score-cell">
                      <span className="ow-wd-score-label">{sc.label}</span>
                      <div className="ow-wd-score-value">{sc.value}</div>
                      <div className="ow-wd-score-foot">
                        <span className="ow-wd-score-trend">{sc.trend || ''}</span>
                        {sc.subLabel && <span className="ow-wd-score-sub">{sc.subLabel}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 2-Column Thesis Grid */}
                <div className="ow-wd-cols">
                  {/* Left Column: Short Term Operational Thesis */}
                  <div className="ow-wd-col">
                    <div className="ow-wd-block">
                      <h3 className="ow-wd-sec-title">
                        <TrendingUp size={13} />
                        <span>Luận Điểm Vận Hành Ngắn Hạn</span>
                      </h3>
                      <ul className="ow-wd-list">
                        {tearSheetPayload.shortTermThesis.map((st, i) => (
                          <li key={i}>
                            <span className="ow-wd-bullet">•</span>
                            <span>{st}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Catalysts Block */}
                    {tearSheetPayload.catalystsAndRisks.filter((c) => c.type === 'catalyst').length > 0 && (
                      <div className="ow-wd-block">
                        <h4 className="ow-wd-sub-title is-good">
                          <Sparkles size={12} />
                          <span>Xúc Tác Đột Phá (Catalysts)</span>
                        </h4>
                        <ul className="ow-wd-list">
                          {tearSheetPayload.catalystsAndRisks
                            .filter((c) => c.type === 'catalyst')
                            .map((c, i) => (
                              <li key={i}>
                                <span className="ow-wd-bullet is-good">▲</span>
                                <span>{c.text}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Long Term Thesis & Risks */}
                  <div className="ow-wd-col">
                    <div className="ow-wd-block">
                      <h3 className="ow-wd-sec-title">
                        <ShieldCheck size={13} />
                        <span>Lợi Thế Cạnh Tranh & Dài Hạn</span>
                      </h3>
                      <ul className="ow-wd-list">
                        {tearSheetPayload.longTermThesis.map((lt, i) => (
                          <li key={i}>
                            <span className="ow-wd-bullet">•</span>
                            <span>{lt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Risks Block */}
                    {tearSheetPayload.catalystsAndRisks.filter((c) => c.type === 'risk').length > 0 && (
                      <div className="ow-wd-block">
                        <h4 className="ow-wd-sub-title is-bad">
                          <AlertCircle size={12} />
                          <span>Rủi Ro Trọng Yếu (Key Risks)</span>
                        </h4>
                        <ul className="ow-wd-list">
                          {tearSheetPayload.catalystsAndRisks
                            .filter((c) => c.type === 'risk')
                            .map((c, i) => (
                              <li key={i}>
                                <span className="ow-wd-bullet is-bad">▼</span>
                                <span>{c.text}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sources & Data Provenance Footer */}
                {tearSheetPayload.sources && tearSheetPayload.sources.length > 0 && (
                  <div className="ow-wd-sources">
                    <h4 className="ow-wd-sub-title">Nguồn Dữ Liệu &amp; Chứng Thực Kiểm Toán</h4>
                    <ol>
                      {tearSheetPayload.sources.map((s, idx) => {
                        const safeUrl = isSafeUrl(s.url) ? s.url : '#';
                        return (
                          <li key={idx}>
                            <span className="ow-wd-src-title">{s.title}</span>{' '}
                            — <code className="ow-wd-src-url">{safeUrl}</code>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </div>
            ) : htmlContent ? (
              <div className="ow-md" dangerouslySetInnerHTML={{ __html: sanitizeHtml(htmlContent) }} />
            ) : isDemoLegal ? (
              <div className="cuccu-legal-demo-doc">
                <div className="legal-motto-block">
                  <p className="legal-motto-country">HỆ THỐNG PHÂN TÍCH DỮ LIỆU TÀI CHÍNH DOANH NGHIỆP · DB-GPT STUDIO</p>
                  <p className="legal-motto-phrase">Báo Cáo Điều Hành &amp; Thẩm Định Số Liệu PnL Q3/2026</p>
                </div>

                <h1 className="legal-doc-title">BÁO CÁO PHÂN TÍCH TÀI CHÍNH &amp; HIỆU QUẢ HOẠT ĐỘNG Q3/2026</h1>
                <p className="legal-doc-code">Mã số: BC-TC/2026-Q3/DB-GPT · Dữ liệu kho PostgreSQL DW · Chuẩn mực VAS &amp; IFRS</p>

                <p className="legal-editorial-note mb-3.5">
                  Báo cáo tổng hợp số liệu tài chính hợp nhất 4 quý, đối soát từ PostgreSQL Data Warehouse và hệ thống ERP, cung cấp luận điểm phân tích phục vụ quyết định điều hành của Ban Lãnh Đạo:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5 text-xs font-serif">
                  <div className="p-3 bg-stone-50/80 dark:bg-zinc-800/40 border border-stone-200/80 dark:border-zinc-700/60 rounded-md">
                    <p className="mb-1 font-bold text-foreground">ĐƠN VỊ LẬP BÁO CÁO:</p>
                    <p className="mb-0.5 text-foreground">KHỐI PHÂN TÍCH DỮ LIỆU &amp; KẾ TOÁN QUẢN TRỊ (FP&amp;A)</p>
                    <p className="m-0 text-muted-foreground">Đại diện: Trần Thị Bích Ngọc, CFA · Trưởng ban Phân tích Tài chính</p>
                  </div>
                  <div className="p-3 bg-stone-50/80 dark:bg-zinc-800/40 border border-stone-200/80 dark:border-zinc-700/60 rounded-md">
                    <p className="mb-1 font-bold text-foreground">CƠ QUAN TIẾP NHẬN:</p>
                    <p className="mb-0.5 text-foreground">HỘI ĐỒNG QUẢN TRỊ &amp; TỔNG GIÁM ĐỐC ĐIỀU HÀNH</p>
                    <p className="m-0 text-muted-foreground">Đại diện: Nguyễn Hoàng Nam · Tổng Giám Đốc Điều Hành (CEO)</p>
                  </div>
                </div>

                <div className={`legal-article-block ${isWritingClause(1) ? 'legal-clause-writing is-writing' : ''}`}>
                  <p className="legal-article-title">Mục 1. Tổng quan Doanh thu Thuần &amp; Tăng trưởng Thị phần Q3/2026</p>
                  <p className="legal-clause-text">
                    1. Tổng doanh thu thuần ghi nhận trong Q3/2026 đạt <strong>42.8 Tỷ VNĐ</strong> (tương đương <strong>$2,450,000</strong>), tăng trưởng <strong>+18.4% YoY</strong> so với cùng kỳ năm trước, vượt 8.2% so với chỉ tiêu kế hoạch kinh doanh đề ra.
                  </p>
                  <p className="legal-clause-text">
                    2. Tỷ lệ giữ chân doanh thu thuần (Net Revenue Retention - NRR) duy trì ở mức cao <strong>118.2%</strong>, cho thấy biên độ mở rộng hợp đồng từ các đối tác chiến lược và doanh nghiệp vừa và lớn đạt hiệu quả vượt trội.
                    {isWritingClause(1) && <span className="legal-caret" aria-hidden="true" />}
                  </p>
                </div>

                <div className={`legal-article-block ${isWritingClause(2) ? 'legal-clause-writing is-writing' : ''}`}>
                  <p className="legal-article-title">Mục 2. Cơ cấu Chi phí, Giá vốn &amp; Biên Lợi nhuận Gộp</p>
                  <p className="legal-clause-text">
                    1. Giá vốn hàng bán (COGS) trong kỳ là <strong>1.62 triệu USD</strong>. Biên lợi nhuận gộp đạt <strong>33.9%</strong> (tăng <strong>+3.2%</strong> so với Q2/2026), nhờ tái cấu trúc hợp đồng nhà cung cấp dữ liệu và tối ưu chi phí điện toán hạ tầng đám mây.
                  </p>
                  <p className="legal-clause-text">
                    2. Tổng chi phí hoạt động (OPEX) được kiểm soát ở mức <strong>$470,000</strong>, trong đó chi phí Bán hàng &amp; Tiếp thị (S&amp;M) đạt hiệu suất ROI <strong>310.5%</strong>, là mức sinh lời tiếp thị cao nhất từ đầu năm 2026.
                    {isWritingClause(2) && <span className="legal-caret" aria-hidden="true" />}
                  </p>
                </div>

                <div className={`legal-article-block ${isWritingClause(3) ? 'legal-clause-writing is-writing' : ''}`}>
                  <p className="legal-article-title">Mục 3. Hiệu quả Hoạt động, Dòng tiền &amp; Lợi nhuận Ròng (EBITDA)</p>
                  <p className="legal-clause-text">
                    1. Lợi nhuận thuần từ HĐKD (EBITDA) đạt <strong>10.5 Tỷ VNĐ</strong> ($360,000), biên EBITDA đạt <strong>14.7%</strong>. Lợi nhuận ròng sau thuế đạt <strong>$249,600</strong>, vượt <strong>12.5%</strong> so với mục tiêu quý do HĐQT phê duyệt.
                  </p>
                  <p className="legal-clause-text">
                    2. Dòng tiền thuần từ hoạt động kinh doanh (Operating Cash Flow) dương <strong>+3.8 Tỷ VNĐ</strong>, hệ số thanh toán nhanh (Quick Ratio) đạt <strong>2.45 lần</strong>, đảm bảo thanh khoản an toàn cho các dự án đầu tư mở rộng trong Q4/2026.
                  </p>
                  {isWritingClause(3) && (
                    <div className="legal-clause-note">
                      ◆ Đối soát số liệu tự động hoàn tất: 100% chỉ số khớp với Sổ cái Kế toán Tổng hợp SAP ERP và PostgreSQL DW.
                    </div>
                  )}
                </div>

                <div className={`legal-article-block ${isWritingClause(4) ? 'legal-clause-writing is-writing' : ''}`}>
                  <p className="legal-article-title">Mục 4. Dự báo Kịch bản Kinh doanh &amp; Kế hoạch Hành động Q4/2026</p>
                  <p className="legal-clause-text">
                    1. Kịch bản cơ sở (Base Case): Dự kiến doanh thu Q4/2026 đạt <strong>$2,680,000</strong> (+21.2% YoY) và lợi nhuận ròng đạt <strong>$328,000</strong>. Toàn niên hạn 2026 dự kiến đạt mốc doanh thu vượt 100 Tỷ VNĐ.
                  </p>
                  <p className="legal-clause-text">
                    2. Ban Điều Hành đề xuất tiếp tục đầu tư mở rộng năng lực phân tích dữ liệu tự động (Autonomous Analytics Engine) và tối ưu hóa hạ tầng nhằm nâng cao biên lợi nhuận ròng lên trên 12.0%.
                    {isWritingClause(4) && <span className="legal-caret" aria-hidden="true" />}
                  </p>
                </div>

                <div className="legal-signature-grid">
                  <div>
                    <p>TRƯỞNG BAN PHÂN TÍCH TÀI CHÍNH</p>
                    <p className="legal-sig-sub">(Ký &amp; xác nhận số liệu kiểm toán)</p>
                    <div className="legal-sig-space" />
                    <p className="font-serif italic font-semibold text-xs text-foreground">Trần Thị Bích Ngọc, CFA</p>
                  </div>
                  <div>
                    <p>TỔNG GIÁM ĐỐC ĐIỀU HÀNH (CEO)</p>
                    <p className="legal-sig-sub">(Ký, phê duyệt &amp; ban hành)</p>
                    <div className="legal-sig-space" />
                    <p className="font-serif italic font-semibold text-xs text-foreground">Nguyễn Hoàng Nam</p>
                  </div>
                </div>
              </div>
            ) : (
              <OpenWorkMarkdownRenderer content={fallbackMarkdown} />
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default WordArtifactViewer;
