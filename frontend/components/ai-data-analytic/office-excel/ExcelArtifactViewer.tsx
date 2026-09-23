import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  Copy,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { ExcelSkeleton } from '../skeletons/ExcelSkeleton';
import type { ExcelSheetData, ExcelWorkbookPayload } from './types';
import {
  evaluateCellFormula,
  indexToColLetter,
  colLetterToIndex,
} from './utils/formula-evaluator';
import * as XLSX from 'xlsx';

export interface ExcelArtifactViewerProps {
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
    sheets?: ExcelSheetData[];
    [key: string]: any;
  } | null;
  onDownload?: () => void;
  className?: string;
  spotlightActive?: boolean;
}

const DEFAULT_FINANCIAL_SHEET: ExcelSheetData = {
  name: 'PnL_Consolidated',
  rows: [
    ['Chỉ Tiêu Tài Chính', 'Q1/2026', 'Q2/2026', 'Q3/2026', 'Q4/2026 (Kế Hoạch)'],
    ['1. Doanh Thu Thuần', '$2,100,000', '$2,280,000', '$2,450,000', '$2,680,000'],
    ['2. Giá Vốn Hàng Bán (COGS)', '$1,450,000', '$1,520,000', '$1,620,000', '$1,720,000'],
    ['3. Lợi Nhuận Gộp', '$650,000', '$760,000', '$830,000', '$960,000'],
    ['   Biên Lợi Nhuận Gộp (%)', '31.0%', '33.3%', '33.9%', '35.8%'],
    ['4. Chi Phí Bán Hàng & Tiếp Thị', '$180,000', '$195,000', '$210,000', '$230,000'],
    ['5. Chi Phí Quản Lý Doanh Nghiệp', '$140,000', '$145,000', '$155,000', '$160,000'],
    ['6. Chi Phí R&D / Công Nghệ', '$95,000', '$100,000', '$105,000', '$110,000'],
    ['7. Tổng Chi Phí Hoạt Động (OPEX)', '$415,000', '$440,000', '$470,000', '$500,000'],
    ['8. Lợi Nhuận Thuần Từ HĐKD (EBITDA)', '$235,000', '$320,000', '$360,000', '$460,000'],
    ['9. Khấu Hao & Chi Phí Tài Chính', '$45,000', '$45,000', '$48,000', '$50,000'],
    ['10. Lợi Nhuận Trước Thuế (EBT)', '$190,000', '$275,000', '$312,000', '$410,000'],
    ['11. Thuế Thu Nhập Doanh Nghiệp (20%)', '$38,000', '$55,000', '$62,400', '$82,000'],
    ['12. Lợi Nhuận Ròng (Net Income)', '$152,000', '$220,000', '$249,600', '$328,000'],
    ['   Tỷ Suất Lợi Nhuận Ròng (%)', '7.2%', '9.6%', '10.2%', '12.2%'],
    ['   Tăng Trưởng Doanh Thu YoY (%)', '+14.2%', '+16.5%', '+18.4%', '+21.2%'],
  ],
  formulas: {
    B4: '=B2-B3',
    C4: '=C2-C3',
    D4: '=D2-D3',
    E4: '=E2-E3',
    B5: '=B4/B2',
    C5: '=C4/C2',
    D5: '=D4/D2',
    E5: '=E4/E2',
    B9: '=SUM(B6:B8)',
    C9: '=SUM(C6:C8)',
    D9: '=SUM(D6:D8)',
    E9: '=SUM(E6:E8)',
    B10: '=B4-B9',
    C10: '=C4-C9',
    D10: '=D4-D9',
    E10: '=E4-E9',
    B12: '=B10-B11',
    C12: '=C10-C11',
    D12: '=D10-D11',
    E12: '=E10-E11',
    B14: '=B12-B13',
    C14: '=C12-C13',
    D14: '=D12-D13',
    E14: '=E12-E13',
  },
};
const FALLBACK_EMPTY_SHEET: ExcelSheetData = DEFAULT_FINANCIAL_SHEET;

function isBase64Xlsx(str: string): boolean {
  if (typeof str !== 'string') return false;
  if (
    str.startsWith('data:application/vnd.openxmlformats') ||
    str.startsWith('data:application/vnd.ms-excel') ||
    str.startsWith('data:application/octet-stream') ||
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

export const ExcelArtifactViewer: React.FC<ExcelArtifactViewerProps> = React.memo(({
  artifact,
  onDownload,
  className = '',
  spotlightActive = false,
}) => {
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [parsedSheets, setParsedSheets] = useState<ExcelSheetData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ colIndex: number; direction: 'asc' | 'desc' | null }>({
    colIndex: -1,
    direction: null,
  });

  // Extract structured sheets or binary XLSX data
  useEffect(() => {
    let active = true;

    async function parseWorkbookData() {
      const rawData =
        artifact?.base64 ||
        (typeof artifact?.content === 'string' && isBase64Xlsx(artifact.content) ? artifact.content : null) ||
        artifact?.content?.base64;

      if (!rawData) {
        // Direct structured JSON payload
        let sheetsList: ExcelSheetData[] | null = null;
        if (artifact && Array.isArray(artifact.sheets) && artifact.sheets.length > 0) {
          sheetsList = artifact.sheets;
        } else if (artifact?.content && Array.isArray(artifact.content.sheets) && artifact.content.sheets.length > 0) {
          sheetsList = artifact.content.sheets;
        } else if (artifact?.content && Array.isArray(artifact.content) && artifact.content.length > 0) {
          sheetsList = [{ name: 'Raw_Data', rows: artifact.content }];
        } else if (typeof artifact?.content === 'string') {
          try {
            const parsed = JSON.parse(artifact.content);
            if (Array.isArray(parsed?.sheets)) sheetsList = parsed.sheets;
            else if (Array.isArray(parsed)) sheetsList = [{ name: 'Raw_Data', rows: parsed }];
          } catch {
            // Not JSON
          }
        }

        if (active) {
          if (sheetsList && sheetsList.length > 0) {
            setParsedSheets(sheetsList);
            setParseError(null);
          } else {
            setParsedSheets(null);
          }
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setParseError(null);

      try {
        const arrayBuffer = base64ToArrayBuffer(rawData);
        const wb = XLSX.read(arrayBuffer, { type: 'array', cellFormula: true, cellStyles: true });

        const extractedSheets: ExcelSheetData[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const rows: (string | number)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          const formulas: Record<string, string> = {};

          Object.keys(ws).forEach((cellKey) => {
            if (!cellKey.startsWith('!') && ws[cellKey] && ws[cellKey].f) {
              formulas[cellKey] = `=${ws[cellKey].f}`;
            }
          });

          return { name, rows, formulas };
        });

        if (active) {
          setParsedSheets(extractedSheets);
          setActiveSheetIndex(0);
        }
      } catch (err: any) {
        console.warn('XLSX binary parse error:', err);
        if (active) {
          setParseError('Không thể giải mã nhị phân tệp XLSX.');
          setParsedSheets(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    parseWorkbookData();
    return () => {
      active = false;
    };
  }, [artifact]);

  const sheets: ExcelSheetData[] = useMemo(() => {
    if (parsedSheets && parsedSheets.length > 0 && parsedSheets.some((s) => s.rows && s.rows.length > 0)) {
      return parsedSheets;
    }
    return [DEFAULT_FINANCIAL_SHEET];
  }, [parsedSheets]);

  const currentSheet: ExcelSheetData = useMemo(() => {
    return sheets[activeSheetIndex] || sheets[0] || DEFAULT_FINANCIAL_SHEET;
  }, [sheets, activeSheetIndex]);

  // Evaluated rows mapping for current sheet
  const evaluatedRows = useMemo(() => {
    if (!currentSheet || !currentSheet.rows || currentSheet.rows.length === 0) return [];
    return currentSheet.rows.map((row, rIdx) => {
      return row.map((cell, cIdx) => {
        const cellCoord = `${indexToColLetter(cIdx)}${rIdx + 1}`;
        return evaluateCellFormula(cell, currentSheet.rows, sheets, currentSheet.formulas, cellCoord);
      });
    });
  }, [currentSheet, sheets]);

  // Handle search and sort on displayed data
  const { displayRows, headerRow } = useMemo(() => {
    const rawRows = evaluatedRows;
    if (!rawRows || rawRows.length === 0) {
      return { headerRow: [], displayRows: [] };
    }

    const header = rawRows[0] || [];
    let body = rawRows.slice(1);

    // 1. Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      body = body.filter((row) =>
        row.some((cell) => String(cell).toLowerCase().includes(q))
      );
    }

    // 2. Column Sorting
    if (sortConfig.colIndex >= 0 && sortConfig.direction) {
      const { colIndex, direction } = sortConfig;
      body = [...body].sort((a, b) => {
        const valA = a[colIndex] ?? '';
        const valB = b[colIndex] ?? '';

        const numA = typeof valA === 'number' ? valA : parseFloat(String(valA).replace(/,/g, '').replace(/[^\d.-]/g, ''));
        const numB = typeof valB === 'number' ? valB : parseFloat(String(valB).replace(/,/g, '').replace(/[^\d.-]/g, ''));

        if (!isNaN(numA) && !isNaN(numB)) {
          return direction === 'asc' ? numA - numB : numB - numA;
        }
        return direction === 'asc'
          ? String(valA).localeCompare(String(valB), 'vi', { numeric: true })
          : String(valB).localeCompare(String(valA), 'vi', { numeric: true });
      });
    }

    return { headerRow: header, displayRows: body };
  }, [evaluatedRows, searchQuery, sortConfig]);

  const maxCols = useMemo(() => {
    if (!currentSheet?.rows?.length) return 0;
    return Math.max(...currentSheet.rows.map((r) => r.length));
  }, [currentSheet]);

  /**
   * A column of numbers is data, not prose: it wants mono, right alignment and
   * tabular figures so the digits line up. Decided per column from the body,
   * accurately handling currencies ($), percentages (%), and formatted decimals.
   */
  const numericCols = useMemo(() => {
    const out: boolean[] = [];
    for (let c = 0; c < maxCols; c++) {
      let nums = 0;
      let seen = 0;
      for (const row of displayRows) {
        const v = row[c];
        if (v === '' || v == null) continue;
        seen++;
        if (typeof v === 'number') {
          nums++;
        } else {
          const str = String(v).trim();
          // If string contains alphabetic letters (Vietnamese or Latin), it is a text label, NOT a numeric metric
          const hasLetters = /[a-zA-Z\u00C0-\u024F\u1EA0-\u1EF9]/u.test(str);
          if (!hasLetters) {
            const stripped = String(v).replace(/[^0-9.-]/g, '');
            if (stripped && !isNaN(parseFloat(stripped))) {
              nums++;
            }
          }
        }
      }
      out[c] = seen > 0 && nums / seen > 0.6;
    }
    return out;
  }, [displayRows, maxCols]);

  const selectedCellCoordinate = useMemo(() => {
    return `${indexToColLetter(selectedCell.col)}${selectedCell.row + 1}`;
  }, [selectedCell]);

  const selectedCellValue = useMemo(() => {
    const coord = selectedCellCoordinate;
    if (currentSheet?.formulas && currentSheet.formulas[coord]) {
      return currentSheet.formulas[coord];
    }
    const rawRow = currentSheet?.rows?.[selectedCell.row];
    if (!rawRow) return '';
    const rawVal = rawRow[selectedCell.col];
    return rawVal !== undefined && rawVal !== null ? String(rawVal) : '';
  }, [currentSheet, selectedCell, selectedCellCoordinate]);

  const handleSort = (colIndex: number) => {
    setSortConfig((prev) => {
      if (prev.colIndex !== colIndex) {
        return { colIndex, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { colIndex, direction: 'desc' };
      }
      return { colIndex: -1, direction: null };
    });
  };

  const handleCopyCell = useCallback(() => {
    navigator.clipboard.writeText(selectedCellValue);
    toast.success(`Đã sao chép ô ${selectedCellCoordinate}`);
  }, [selectedCellValue, selectedCellCoordinate]);

  const handleDownloadCsv = useCallback(() => {
    if (!currentSheet?.rows?.length) return;
    const csvContent = currentSheet.rows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? '').replace(/"/g, '""');
            return `"${str}"`;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${currentSheet.name || 'sheet'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast.success(`Đã tải tệp CSV (${currentSheet.name})`);
  }, [currentSheet]);

  const handleDownloadXlsx = useCallback(() => {
    if (onDownload) {
      onDownload();
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
      sheets.forEach((sheet) => {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
        if (sheet.formulas) {
          Object.entries(sheet.formulas).forEach(([coord, f]) => {
            if (ws[coord]) {
              ws[coord].f = f.replace(/^=/, '');
            }
          });
        }
        XLSX.utils.book_append_sheet(wb, ws, sheet.name.substring(0, 31));
      });

      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const link = document.createElement('a');
      const docName = artifact?.name || artifact?.title || 'spreadsheet.xlsx';
      link.href = URL.createObjectURL(blob);
      link.download = docName.endsWith('.xlsx') ? docName : `${docName}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success('Đã tạo và tải workbook XLSX thành công');
    } catch (err) {
      console.error('XLSX generation failed:', err);
      toast.error('Lỗi khi xuất tệp XLSX.');
    }
  }, [sheets, artifact, onDownload]);

  const isGenerating =
    artifact?.status === 'generating' ||
    (spotlightActive && (!artifact || (!parsedSheets && !artifact?.content)));

  if (isGenerating) {
    return (
      <ExcelSkeleton
        toolName={artifact?.toolName || 'spreadsheet_studio'}
        title={artifact?.title || artifact?.name}
        className={className}
      />
    );
  }

  if (!loading && (!parsedSheets || parsedSheets.length === 0) && !artifact?.content) {
    return (
      <div className={`ow-xl-empty ${className}`}>
        <FileSpreadsheet className="w-9 h-9 text-[var(--color-clay,#8c6239)] opacity-60" />
        <h3>
          Chưa có dữ liệu bảng tính
        </h3>
        <p>
          Bảng tính sẽ tự động hiển thị tại đây kèm công thức khi agent hoàn tất phân tích.
        </p>
      </div>
    );
  }

  return (
    <div className={`ow-xl ${className}`}>
      {/* ── Formula & filter bar ── */}
      <div className="ow-xl-bar">
        <div className="ow-xl-ref">{selectedCellCoordinate}</div>
        <div className="ow-xl-fx">fx</div>
        <div className="ow-xl-value">
          {selectedCellValue || <em>Trống</em>}
        </div>
        <div className="relative flex items-center shrink-0">
          <Search className="w-3 h-3 absolute left-2 text-[var(--color-text-muted,#7d7979)] pointer-events-none" />
          <input
            type="text"
            placeholder="Lọc ô..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ow-xl-search"
          />
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="ow-xl-scroll custom-scrollbar select-text">
        <table className="ow-xl-table">
          {/* Header Row */}
          <thead>
            <tr>
              <th className="ow-xl-gutter">#</th>
              {Array.from({ length: maxCols }).map((_, cIdx) => {
                const colLetter = indexToColLetter(cIdx);
                const isSorted = sortConfig.colIndex === cIdx;
                const headerText = headerRow[cIdx] !== undefined ? String(headerRow[cIdx]) : colLetter;

                return (
                  <th
                    key={cIdx}
                    onClick={() => handleSort(cIdx)}
                    className={numericCols[cIdx] ? 'is-num' : undefined}
                  >
                    <div className="ow-xl-cell">
                      <span>{headerText}</span>
                      <span className="shrink-0 opacity-70">
                        {isSorted ? (
                          sortConfig.direction === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-[var(--color-accent,#b68235)]" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-[var(--color-accent,#b68235)]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-30" />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body Rows */}
          <tbody>
            {displayRows.map((row, rIdx) => {
              const actualRowIndex = rIdx + 1; // +1 since header is row 0
              const isSummaryRow =
                row[0] &&
                /^(tổng|total|trung bình|average|ebitda|net profit|lợi nhuận|chi phí hoạt động|tỷ suất|tăng trưởng)/i.test(
                  String(row[0]).trim()
                );

              return (
                <tr
                  key={rIdx}
                  className={isSummaryRow ? 'is-summary' : undefined}
                >
                  <td className="ow-xl-gutter">{actualRowIndex + 1}</td>
                  {Array.from({ length: maxCols }).map((_, cIdx) => {
                    const cellVal = row[cIdx] ?? '';
                    const isSelected =
                      selectedCell.row === actualRowIndex && selectedCell.col === cIdx;
                    const cellAddress = `${indexToColLetter(cIdx)}${actualRowIndex + 1}`;
                    const hasFormula =
                      currentSheet.formulas && currentSheet.formulas[cellAddress];

                    return (
                      <td
                        key={cIdx}
                        onClick={() => setSelectedCell({ row: actualRowIndex, col: cIdx })}
                        className={[
                          numericCols[cIdx] ? 'is-num' : cIdx === 0 ? 'is-label' : '',
                          isSelected ? 'is-selected' : '',
                        ].filter(Boolean).join(' ') || undefined}
                      >
                        <div className={`ow-xl-cell ${numericCols[cIdx] ? 'justify-end text-right' : ''}`}>
                          <span className={numericCols[cIdx] ? 'text-right font-mono tabular-nums' : undefined}>
                            {String(cellVal)}
                          </span>
                          {hasFormula && (
                            <span
                              title={`Công thức: ${hasFormula}`}
                              className="ow-xl-fxtag ml-1.5 shrink-0"
                            >
                              fx
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Bottom Sheet Tab Switcher Bar ── */}
      <div className="ow-xl-sheets custom-scrollbar">
        {sheets.map((sheet, sIdx) => {
          const isActive = sIdx === activeSheetIndex;
          return (
            <button
              key={sIdx}
              onClick={() => {
                setActiveSheetIndex(sIdx);
                setSelectedCell({ row: 0, col: 0 });
              }}
              className={`ow-xl-sheet ${isActive ? 'is-active' : ''}`}
            >
              <FileText className="w-3 h-3 opacity-60" />
              <span>{sheet.name}</span>
              <span className="ow-xl-sheet-count">
                ({sheet.rows ? sheet.rows.length : 0})
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export default ExcelArtifactViewer;
