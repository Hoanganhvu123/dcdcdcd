import React from 'react';
import {
  LayoutDashboard,
  Terminal,
  PanelsTopLeft,
  Database,
  Cpu,
  Brain,
  KeyRound,
  Users,
  History,
  CreditCard,
  ReceiptText,
  Bell,
  Settings2,
  FileSpreadsheet,
  Presentation,
  FileText,
} from 'lucide-react';

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
}

/**
 * Authentic Vector SVG Icons for AI Data Analytics
 * Powered by Lucide React and Official Claude Design DNA.
 * Standardized across all editorial workspaces.
 */

// 1. Dashboard: Multi-metric telemetry & visual telemetry
export const IconDashboard: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <LayoutDashboard
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 2. Prompt Codex: Terminal & structured prompts
export const IconPromptCodex: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <Terminal
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 3. Workbench Studio: Dual-pane analytical workspace
export const IconWorkbenchStudio: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <PanelsTopLeft
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 4. Data Warehouse: High-performance columnar SQL storage
export const IconDataWarehouse: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <Database
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 5. Skill & MCP: Neural modular connector
export const IconSkillMCP: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <Cpu
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 6. Global Memory: Cognitive knowledge brain
export const IconGlobalMemory: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <Brain
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 7. API Keys: Cryptographic authorization keys
export const IconApiKeys: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <KeyRound
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 8. Team Members: Analyst team hierarchy & access
export const IconTeamMembers: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <Users
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 9. Audit Log: Cryptographic ledger & event history
export const IconAuditLog: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <History
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 10. Billing: Subscriptions & card transactions
export const IconBilling: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <CreditCard
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 11. Pricing: Tiered plans & ledger receipts
export const IconPricing: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <ReceiptText
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 12. Notifications: Resonant alert bell
export const IconNotifications: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <Bell
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 13. Settings: Calibration dials & system config
export const IconSettings: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <Settings2
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 14. Excel XLSX: Financial spreadsheet matrix
export const IconExcelXlsx: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <FileSpreadsheet
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 15. Slide PPTX: 16:9 Presentation deck
export const IconSlidePptx: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <Presentation
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 16. Word DOCX: Editorial executive tear-sheet
export const IconWordDocx: React.FC<IconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <FileText
    size={size}
    strokeWidth={strokeWidth}
    className={className}
    {...props}
  />
);

// 17. Claude Starburst Sparkle: Pure Anthropic 4-point Radiant Starburst
export const IconClaudeStarburst: React.FC<IconProps> = ({
  size = 16,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path d="M12 2C12 7.523 7.523 12 2 12C7.523 12 12 16.477 12 22C12 16.477 16.477 12 22 12C16.477 12 12 7.523 12 2Z" />
  </svg>
);

// 18. Claude Official 14-spoke Asterisk Mark
export const IconClaudeAsterisk: React.FC<IconProps> = ({
  size = 16,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path d="M13.88 2.05a.75.75 0 0 0-1.03.36l-2.03 4.29a.75.75 0 1 0 1.36.64l2.03-4.29a.75.75 0 0 0-.33-1zm4.84 2.8a.75.75 0 0 0-1.06-.05l-3.5 3.24a.75.75 0 1 0 1.02 1.1l3.5-3.23a.75.75 0 0 0 .04-1.06zm3.23 6.03a.75.75 0 0 0-.75-.75h-4.75a.75.75 0 0 0 0 1.5h4.75a.75.75 0 0 0 .75-.75zm-2.12 5.09a.75.75 0 0 0-.97-.4l-4.4 1.83a.75.75 0 1 0 .58 1.38l4.4-1.83a.75.75 0 0 0 .39-.98zm-5.71 4.31a.75.75 0 0 0-.72-.53h-.06a.75.75 0 0 0-.71.55l-1.35 4.56a.75.75 0 1 0 1.44.42l1.35-4.56a.75.75 0 0 0-.05-.44h.1zm-6.19.86a.75.75 0 0 0-.25-1.03l-4.04-2.5a.75.75 0 1 0-.79 1.28l4.04 2.5a.75.75 0 0 0 1.04-.25zm-5.78-5.32a.75.75 0 0 0 .22-1.03l-2.73-3.92a.75.75 0 0 0-1.23.86l2.73 3.92a.75.75 0 0 0 1.01.17zm1.88-6.07a.75.75 0 0 0 .74-.63l.79-4.7a.75.75 0 1 0-1.48-.25l-.79 4.7a.75.75 0 0 0 .74.88z" />
  </svg>
);

/**
 * Editorial Vignette (Clean empty stub to prevent layout distortion)
 */
export const AnalyticsArtisticVignette: React.FC<{ className?: string }> = () => null;
