/**
 * Excel XLSX 4-Tabs Data Contracts & Types
 */

export interface ExcelSheetData {
  name: 'README' | 'Raw_Data' | 'Cleaned_Analysis' | 'KPI_Dashboard' | string;
  rows: (string | number)[][];
  formulas?: Record<string, string>; // e.g. { "D2": "=SUM(B2:C2)", "E2": "=AVERAGE(B2:D2)" }
  metadata?: {
    isHighlightRow?: (rowIndex: number) => boolean;
    headerStyle?: Record<string, string>;
    summaryRows?: number[];
  };
}

export interface ExcelWorkbookPayload {
  title: string;
  sheets: ExcelSheetData[];
  rowCount?: number;
  executionTimeMs?: number;
  dataSource?: string;
}
