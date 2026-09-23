/**
 * Word DOCX 2-Column A4 Financial Tear Sheet Contracts & Types
 */

export interface ScorecardItem {
  label: string;
  value: string;
  trend?: string;
  subLabel?: string;
}

export interface CatalystOrRisk {
  type: 'catalyst' | 'risk';
  text: string;
}

export interface SourceReference {
  index: number;
  title: string;
  url: string;
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
  catalystsAndRisks: CatalystOrRisk[];
  sources: SourceReference[];
  rawMarkdown?: string;
}
