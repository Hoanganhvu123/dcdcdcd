import React from 'react';
import type { IconProps } from './AnalyticsIcons';

/**
 * Authentic Bespoke Vector SVG Icons for AI Data Analytics Studio
 * Handcrafted for Columnar SQL, Python Sandbox, Financial Matrices & Executive Slides.
 */

// 1. SQL Database Query Icon
export const SvgSqlDatabase: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    <path d="M19 19l3 3" />
    <circle cx="18" cy="18" r="2" strokeWidth={1.5} />
  </svg>
);

// 2. Python Sandbox Execution Icon
export const SvgPythonSandbox: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M12 2C6.48 2 5 3.5 5 6v3h7v1H4C2 10 2 12.5 2 15s1.5 4 4 4h2v-2.5c0-1.5 1-2.5 2.5-2.5h5c1.5 0 2.5-1 2.5-2.5V6c0-2.5-1.5-4-6-4zm-3 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
    <path d="M12 22c5.52 0 7-1.5 7-4v-3h-7v-1h8c2 0 2-2.5 2-5s-1.5-4-4-4h-2v2.5c0 1.5-1 2.5-2.5 2.5h-5C7 14 6 15 6 16.5V18c0 2.5 1.5 4 6 4zm3-3a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
  </svg>
);

// 3. Excel Spreadsheet Financial Matrix Icon
export const SvgExcelMatrix: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M8 13h8" />
    <path d="M8 17h8" />
    <path d="M12 11v8" />
  </svg>
);

// 4. Executive Slide Deck 16:9 Icon
export const SvgSlideDeck: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
    <path d="M7 12l3-3 2.5 2.5 4.5-4.5" />
  </svg>
);

// 5. Document Analytical Report A4 Icon
export const SvgDocumentReport: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

// 6. Neural Reasoning & Brain Nodes Icon
export const SvgNeuralReasoning: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M9.5 2A4.5 4.5 0 0 0 5 6.5C5 7.7 5.5 8.8 6.3 9.6A5 5 0 0 0 4 14a5 5 0 0 0 5 5h1" />
    <path d="M14.5 2A4.5 4.5 0 0 1 19 6.5c0 1.2-.5 2.3-1.3 3.1A5 5 0 0 1 20 14a5 5 0 0 1-5 5h-1" />
    <path d="M12 4v16" />
    <path d="M9 9h6" />
    <path d="M8 14h8" />
  </svg>
);

// 7. KPI Metric & Trend Delta Icon
export const SvgKpiMetric: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M3 3v18h18" />
    <path d="M7 16l4-4 4 4 6-7" />
    <polyline points="17 9 21 9 21 13" />
  </svg>
);

// 8. PnL Waterfall Chart Icon
export const SvgWaterfallChart: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <line x1="2" y1="21" x2="22" y2="21" />
    <rect x="3" y="10" width="3.5" height="11" rx="0.5" />
    <rect x="7.5" y="6" width="3.5" height="5" rx="0.5" />
    <rect x="12" y="9" width="3.5" height="4" rx="0.5" />
    <rect x="16.5" y="12" width="3.5" height="9" rx="0.5" />
  </svg>
);

// 9. Data Funnel & ETL Pipeline Icon
export const SvgDataFunnel: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    <line x1="7" y1="8" x2="17" y2="8" />
  </svg>
);

// 10. Formula Fx Icon
export const SvgFormulaFx: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M4 8c1-3 3-4 6-4h1v4H8c-1 0-1.5.5-1.5 1.5V12h4v3H6.5v6H3v-6H1v-3h2v-1.5" />
    <path d="M15 11l6 8" />
    <path d="M21 11l-6 8" />
  </svg>
);

// 11. Realtime Sync Status Icon
export const SvgSyncStatus: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M21.5 2v6h-6" />
    <path d="M2.5 22v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L21.5 8" />
    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L2.5 16" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </svg>
);

// 12. Multidimensional Pivot Matrix Icon
export const SvgTablePivot: React.FC<IconProps> = ({
  size = 18,
  className = '',
  strokeWidth = 1.75,
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 3v18" />
    <path d="M14 13l3 3m0 0l-3 3m3-3h-5" />
  </svg>
);
