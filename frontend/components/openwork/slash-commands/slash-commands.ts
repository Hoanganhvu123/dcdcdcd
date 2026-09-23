import type { OpenWorkArtifactTab } from '../types';

export interface SlashCommandPlanStep {
  title: string;
  detail: string;
}

export interface SlashCommandDefinition {
  id: string;
  command: string; // e.g. '/revenue-audit'
  title: string;
  description: string;
  badge: string;
  iconName: 'Calculator' | 'Presentation' | 'FileText' | 'TrendingUp' | string;
  targetTab: OpenWorkArtifactTab;
  defaultPrompt: string;
  planSteps: SlashCommandPlanStep[];
  category?: 'audit' | 'revenue' | 'financial' | 'presentation' | 'document' | 'executive';
}

export interface SlashCommandContext {
  datasourceId?: string;
  datasourceName?: string;
  userQuery?: string;
}

export const CORE_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    id: 'revenue-audit',
    command: '/revenue-audit',
    title: 'Kiểm toán & Phân tích Doanh thu',
    description: 'Kiểm toán nguồn thu, tính Gross/Net Revenue, COGS, Gross Margin & xuất bảng tính Excel',
    badge: 'Audit · Excel',
    iconName: 'Calculator',
    targetTab: 'excel',
    defaultPrompt: 'Thực hiện kiểm toán và phân tích doanh thu toàn diện: trích xuất dữ liệu bán hàng đa kênh, tính toán Gross Revenue, Net Revenue, COGS, Gross Margin, đóng góp theo kênh/sản phẩm và xuất bảng tính Excel đa tab có công thức cùng biểu đồ phân tích.',
    planSteps: [
      {
        title: 'Trích xuất dữ liệu doanh thu đa kênh từ DW',
        detail: 'Truy vấn bảng đơn hàng, doanh số và chiết khấu từ DW',
      },
      {
        title: 'Tính toán Gross Revenue, Net Revenue, COGS & Margin',
        detail: 'Phân tách doanh thu gộp, giảm trừ, giá vốn và biên lợi nhuận',
      },
      {
        title: 'Phân tích đóng góp theo kênh và phát hiện bất thường',
        detail: 'Đánh giá tỷ trọng doanh số Shopee, Lazada, TikTok, Retail',
      },
      {
        title: 'Xuất bảng tính Excel đa tab & vẽ biểu đồ biên lợi nhuận',
        detail: 'Khởi tạo workbook spreadsheet_studio và đồng bộ Artifacts',
      },
    ],
    category: 'audit',
  },
  {
    id: 'slide-deck',
    command: '/slide-deck',
    title: 'Slide Thuyết trình Chiến lược 16:9',
    description: 'Tự động tạo bộ slide thuyết trình điều hành chuẩn tỷ lệ 16:9 với biểu đồ trực quan',
    badge: '16:9 Deck',
    iconName: 'Presentation',
    targetTab: 'slide',
    defaultPrompt: 'Xây dựng bộ slide thuyết trình chiến lược kinh doanh 16:9 hoàn chỉnh: tổng hợp số liệu PnL, thiết kế dàn ý 8-10 slide trực quan (Hero, Bento Grid, Stat Grid, ChartSlide) và đồng bộ biểu đồ vào Slide Studio.',
    planSteps: [
      {
        title: 'Thu thập dữ liệu PnL, KPI và mục tiêu chiến lược',
        detail: 'Tổng hợp chỉ số tài chính và các động lực tăng trưởng',
      },
      {
        title: 'Xây dựng dàn ý 8-10 slide chuẩn tỷ lệ 16:9',
        detail: 'Thiết kế bố cục trực quan cho từng slide thuyết trình',
      },
      {
        title: 'Khởi tạo layout trực quan (Hero, Bento, Stat Grid, Chart)',
        detail: 'Tối ưu hóa các visual elements và điểm nhấn số liệu',
      },
      {
        title: 'Đồng bộ biểu đồ thực tế & hoàn thiện Slide Studio',
        detail: 'Khởi tạo presentation_builder artifact và mở Slide Studio',
      },
    ],
    category: 'presentation',
  },
  {
    id: 'financial-report',
    command: '/financial-report',
    title: 'Báo cáo Tài chính Toàn diện (Word A4)',
    description: 'Lập báo cáo tài chính chi tiết, phân tích P&L, dòng tiền và xuất tài liệu Word A4',
    badge: 'Word A4',
    iconName: 'FileText',
    targetTab: 'docx',
    defaultPrompt: 'Lập báo cáo tài chính toàn diện xuất sang tài liệu Word A4: phân tích báo cáo kết quả kinh doanh (P&L), bảng cân đối kế toán, lưu chuyển tiền tệ, bảng so sánh MoM/YoY và nhận định rủi ro tài chính.',
    planSteps: [
      {
        title: 'Truy vấn dữ liệu tài chính, P&L & bảng cân đối',
        detail: 'Trích xuất sổ cái, chi phí hoạt động và dòng tiền ròng',
      },
      {
        title: 'Lập cấu trúc báo cáo A4 chuyên nghiệp',
        detail: 'Thiết lập Executive Summary, Phân tích chuyên sâu & Kiến nghị',
      },
      {
        title: 'Tổng hợp bảng biểu chi tiết & phân tích rủi ro',
        detail: 'Xây dựng bảng dữ liệu tài chính chi tiết và cảnh báo rủi ro',
      },
      {
        title: 'Xuất tài liệu Word DOCX hoàn chỉnh',
        detail: 'Khởi tạo doc_writer artifact và mở Word Studio',
      },
    ],
    category: 'document',
  },
  {
    id: 'executive-summary',
    command: '/executive-summary',
    title: 'Tóm tắt Điều hành & KPI Cốt lõi',
    description: 'Tóm lược nhanh 4 KPI trọng yếu, so sánh tăng trưởng MoM/YoY và 3-5 khuyến nghị chiến lược',
    badge: 'Executive',
    iconName: 'TrendingUp',
    targetTab: 'chart',
    defaultPrompt: 'Tạo bản tóm tắt điều hành nhanh: tổng hợp 4 chỉ số KPI cốt lõi (Doanh thu, Lợi nhuận ròng, Tăng trưởng MoM/YoY, Runway), biểu đồ xu hướng chính và 3-5 khuyến nghị chiến lược điều hành.',
    planSteps: [
      {
        title: 'Quét nhanh 4 chỉ số KPI trọng yếu',
        detail: 'Tính toán Doanh thu, Lợi nhuận ròng, MoM% và Tỷ lệ hoàn thành kế hoạch',
      },
      {
        title: 'So sánh MoM/YoY & xác định động lực tăng trưởng',
        detail: 'Phân tích biến động doanh số và nguyên nhân tăng giảm',
      },
      {
        title: 'Đánh giá rủi ro & tổng hợp 3-5 khuyến nghị chiến lược',
        detail: 'Đề xuất giải pháp hành động cụ thể cho ban điều hành',
      },
      {
        title: 'Trình bày Key Findings & biểu đồ tóm tắt',
        detail: 'Xuất thẻ kết luận chính và nhúng biểu đồ trực quan',
      },
    ],
    category: 'executive',
  },
];

/**
 * Filter slash commands matching user query (case-insensitive)
 * Checks command string, title, description, badge, category, and target tab.
 */
export function filterSlashCommands(query: string): SlashCommandDefinition[] {
  if (!query || !query.trim()) {
    return CORE_SLASH_COMMANDS;
  }

  const cleanQuery = query.trim().toLowerCase().replace(/^\//, '');
  if (!cleanQuery) {
    return CORE_SLASH_COMMANDS;
  }

  return CORE_SLASH_COMMANDS.filter((cmd) => {
    const commandWithoutSlash = cmd.command.replace(/^\//, '').toLowerCase();
    const titleMatch = cmd.title.toLowerCase().includes(cleanQuery);
    const cmdMatch = commandWithoutSlash.includes(cleanQuery);
    const descMatch = cmd.description.toLowerCase().includes(cleanQuery);
    const badgeMatch = cmd.badge.toLowerCase().includes(cleanQuery);
    const catMatch = cmd.category?.toLowerCase().includes(cleanQuery) ?? false;
    const tabMatch = cmd.targetTab.toLowerCase().includes(cleanQuery);

    return cmdMatch || titleMatch || descMatch || badgeMatch || catMatch || tabMatch;
  });
}

/**
 * Lookup a slash command by id or exact command string
 */
export function getSlashCommand(idOrCommand: string): SlashCommandDefinition | undefined {
  const norm = idOrCommand.trim().toLowerCase();
  return CORE_SLASH_COMMANDS.find(
    (cmd) => cmd.id.toLowerCase() === norm || cmd.command.toLowerCase() === norm || cmd.command.replace(/^\//, '').toLowerCase() === norm
  );
}
