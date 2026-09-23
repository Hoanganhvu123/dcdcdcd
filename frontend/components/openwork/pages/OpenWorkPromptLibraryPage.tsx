import React, { useState, useMemo } from 'react';
import { Search, Plus, Sparkles, MessageSquare, Tag, Copy, Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PromptItem {
  id: string;
  category: string;
  tag: string;
  tone: string;
  title: string;
  snippet: string;
  promptText: string;
  variables: string[];
  uses: string;
}

export interface OpenWorkPromptLibraryPageProps {
  onUsePrompt?: (prompt: PromptItem) => void;
  onSavePrompt?: () => void;
}

const CATEGORIES = [
  { name: 'Tất cả', count: 12 },
  { name: 'Doanh thu', count: 4 },
  { name: 'Khách hàng', count: 3 },
  { name: 'Vận hành', count: 2 },
  { name: 'Báo cáo', count: 2 },
  { name: 'Tra cứu', count: 1 },
  { name: 'Tồn kho', count: 0 },
];

const INITIAL_PROMPTS: PromptItem[] = [
  {
    id: 'p1',
    category: 'Doanh thu',
    tag: 'SQL',
    tone: 'var(--c2)',
    title: 'Phân tích PnL 4 quý & Xuất bảng tính Excel',
    snippet: 'Trích xuất bảng PnL 4 quý gần nhất từ PostgreSQL DW, tính biên đóng góp và tạo file XLSX có Pivot Table.',
    promptText: 'Trích xuất bảng PnL {số quý} quý gần nhất từ kho dữ liệu, phân tích biên lợi nhuận gộp theo kênh bán lẻ và xuất file XLSX tổng hợp.',
    variables: ['{số quý}', '{kênh}'],
    uses: '1.420 lượt',
  },
  {
    id: 'p2',
    category: 'Khách hàng',
    tag: 'DEEP',
    tone: 'var(--c1)',
    title: 'Phân tích Pareto 80/20 top khách hàng VIP',
    snippet: 'Xác định nhóm 20% khách hàng tạo ra 80% tổng doanh thu trong 12 tháng qua, tính chỉ số CAC/LTV.',
    promptText: 'Lập danh sách top 20% khách hàng đóng góp 80% doanh thu trong {thời gian}, phân tích phân khúc và gợi ý kịch bản chăm sóc.',
    variables: ['{thời gian}'],
    uses: '980 lượt',
  },
  {
    id: 'p3',
    category: 'Báo cáo',
    tag: 'PPTX',
    tone: 'var(--c1)',
    title: 'Tạo bài thuyết trình Slide 16:9 cho Ban Giám Đốc',
    snippet: 'Tổng hợp kết quả kinh doanh quý 3, tạo 6 slide thuyết trình điều hành gồm biểu đồ doanh thu và bảng chỉ số chính.',
    promptText: 'Tạo bộ slide 16:9 tổng kết tình hình kinh doanh {quý/năm}, gồm 6 trang: trang bìa, KPI tài chính, tăng trưởng kênh, chi phí và định hướng {quý tiếp theo}.',
    variables: ['{quý/năm}', '{quý tiếp theo}'],
    uses: '850 lượt',
  },
  {
    id: 'p4',
    category: 'Doanh thu',
    tag: 'AGENT',
    tone: 'var(--c3)',
    title: 'Dự báo doanh thu tháng tới bằng mô hình chuỗi thời gian',
    snippet: 'Chạy phân tích dự báo ARIMA / Prophet trong Python Sandbox dựa trên số liệu lịch sử 24 tháng gần nhất.',
    promptText: 'Dự báo doanh thu {số tháng} tháng tới cho nhóm ngành {ngành hàng} dựa trên chuỗi thời gian 24 tháng qua, tính khoảng tin cậy 95%.',
    variables: ['{số tháng}', '{ngành hàng}'],
    uses: '730 lượt',
  },
  {
    id: 'p5',
    category: 'Vận hành',
    tag: 'SQL',
    tone: 'var(--c2)',
    title: 'Thẩm định tỷ lệ hoàn đơn & chi phí vận chuyển',
    snippet: 'Phân tích tỷ lệ hoàn hủy hàng (RTO) theo đơn vị vận chuyển và tỉnh thành giao hàng để tối ưu SLA.',
    promptText: 'Thống kê tỷ lệ hoàn đơn và thời gian giao hàng trung bình theo {đơn vị vận chuyển} trong {tháng}, phân loại theo khu vực.',
    variables: ['{đơn vị vận chuyển}', '{tháng}'],
    uses: '610 lượt',
  },
  {
    id: 'p6',
    category: 'Báo cáo',
    tag: 'DOCX',
    tone: 'var(--c4)',
    title: 'Soạn thảo biên bản phân tích tài chính trang trọng',
    snippet: 'Tạo tài liệu Word A4 thẩm định hiệu quả dự án đầu tư mới với các chỉ số NPV, IRR và Payback Period.',
    promptText: 'Soạn thảo báo cáo thẩm định dự án {tên dự án}, phân tích NPV, IRR, độ nhạy doanh thu và rủi ro chính theo mẫu Word trang trọng.',
    variables: ['{tên dự án}'],
    uses: '490 lượt',
  },
  {
    id: 'p7',
    category: 'Khách hàng',
    tag: 'SQL',
    tone: 'var(--c2)',
    title: 'Cohort Retention Analysis (Tỷ lệ giữ chân khách)',
    snippet: 'Tính tỷ lệ khách hàng quay lại mua hàng sau tháng đầu tiên theo từng nhóm tháng gia nhập (Cohort Matrix).',
    promptText: 'Xây dựng ma trận Cohort Retention {số tháng} tháng cho khách hàng đăng ký từ {thời điểm}, tính tỷ lệ suy giảm.',
    variables: ['{số tháng}', '{thời điểm}'],
    uses: '440 lượt',
  },
  {
    id: 'p8',
    category: 'Doanh thu',
    tag: 'SQL',
    tone: 'var(--c2)',
    title: 'Đối soát doanh thu sàn TMĐT vs Dòng tiền Ngân hàng',
    snippet: 'Đối chiếu số liệu đơn hàng hoàn tất trên sàn và dòng tiền thực nhận tại tài khoản ngân hàng doanh nghiệp.',
    promptText: 'Đối soát chênh lệch doanh thu giữa sàn {tên sàn} và sao kê ngân hàng {tên ngân hàng} trong {chu kỳ đối soát}.',
    variables: ['{tên sàn}', '{tên ngân hàng}', '{chu kỳ đối soát}'],
    uses: '380 lượt',
  },
];

export const OpenWorkPromptLibraryPage: React.FC<OpenWorkPromptLibraryPageProps> = ({
  onUsePrompt,
  onSavePrompt,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredPrompts = useMemo(() => {
    return INITIAL_PROMPTS.filter((p) => {
      const matchCat = selectedCategory === 'Tất cả' || p.category === selectedCategory;
      const matchSearch =
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.snippet.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [selectedCategory, searchQuery]);

  const handleCopyPrompt = (text: string, id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="sticky top-0 z-10 h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)]/60 bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            Thư viện prompt
          </span>
          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-md px-1.5 py-0.5 whitespace-nowrap">
            {INITIAL_PROMPTS.length} prompt mẫu
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1.5 text-[var(--muted-fg)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm prompt, từ khóa…"
              className="w-40 sm:w-56 h-6.5 pl-7 pr-2.5 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--muted-fg)] rounded-lg text-[0.71875rem] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="button"
            onClick={onSavePrompt}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border-0 bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-opacity shadow-xs"
          >
            <Plus size={12} />
            <span>Lưu prompt mới</span>
          </button>
        </div>
      </header>

      {/* ── 2. Canvas Split: Category Sidebar & Prompts Grid ── */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* Left Category List (206px) */}
        <div className="w-[206px] flex-none border-r border-[var(--border)] bg-[var(--panel)] overflow-y-auto p-3 flex flex-col gap-1 custom-scrollbar">
          <div className="text-[0.65625rem] font-medium uppercase tracking-wider text-[var(--muted-fg)] px-2 py-1">
            Chủ đề phân tích
          </div>

          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.name;
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategory(cat.name)}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[0.75rem] transition-colors text-left',
                  isSelected
                    ? 'bg-[var(--muted)] text-[var(--fg)] font-medium'
                    : 'text-[var(--fg2)] hover:bg-[var(--muted)]/60 hover:text-[var(--fg)]'
                )}
              >
                <span>{cat.name}</span>
                <span className="font-mono text-xs rounded-full px-2 py-0.5 border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-fg)] font-medium">
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Prompts Grid */}
        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 bg-[var(--panel)]/40 custom-scrollbar">
          <div className="max-w-[1240px] mx-auto">
            {filteredPrompts.length === 0 ? (
              <div className="p-12 text-center text-[var(--muted-fg)] border border-[var(--border)] rounded-2xl bg-[var(--card)]">
                Không tìm thấy prompt nào trong danh mục này
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredPrompts.map((p) => {
                  const isCopied = copiedId === p.id;
                  return (
                    <div
                      key={p.id}
                      className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-4 shadow-[var(--shadow)] flex flex-col justify-between hover:-translate-y-1 hover:shadow-md transition-all duration-200 hover:border-[var(--accent)]/50 group"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            style={{ color: p.tone }}
                            className="font-mono text-[0.625rem] font-semibold px-2 py-0.5 rounded-full border border-[var(--border)] bg-[var(--muted)]"
                          >
                            {p.tag}
                          </span>
                          <span className="rounded-full px-2.5 py-0.5 text-xs font-medium border border-[var(--border)] bg-[var(--muted)] text-[var(--fg)]">
                            {p.category}
                          </span>
                        </div>

                        <h3 className="text-[0.8125rem] font-medium text-[var(--fg)] mt-2 leading-snug">
                          {p.title}
                        </h3>

                        {/* Prompt Snippet Box */}
                        <div className="mt-2.5 p-2.5 bg-[var(--bg)] border border-[var(--hair)] rounded-xl text-[0.71875rem] text-[var(--fg2)] leading-relaxed font-mono">
                          {p.snippet}
                        </div>

                        {/* Variables Chips */}
                        {p.variables.length > 0 && (
                          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                            {p.variables.map((v) => (
                              <span
                                key={v}
                                className="font-mono text-[0.625rem] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-fg)] border border-[var(--border)]"
                              >
                                {v}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="mt-4 pt-3 border-t border-[var(--hair)] flex items-center justify-between gap-2">
                        <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)]">
                          {p.uses}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyPrompt(p.promptText, p.id)}
                            title={isCopied ? 'Đã sao chép' : 'Sao chép nội dung prompt'}
                            className={cn(
                              'p-1.5 rounded-lg border transition-all duration-200 flex items-center justify-center',
                              isCopied
                                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 scale-105 shadow-xs'
                                : 'border-[var(--border)] hover:bg-[var(--muted)] text-[var(--muted-fg)] hover:text-[var(--fg)] active:scale-95'
                            )}
                          >
                            {isCopied ? (
                              <Check size={12} className="text-emerald-600 dark:text-emerald-400 transition-transform duration-200 scale-110" />
                            ) : (
                              <Copy size={12} className="transition-transform duration-200 hover:scale-105" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onUsePrompt?.(p)}
                            className="h-7 px-2.5 flex items-center gap-1 border-0 bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 rounded-lg text-[0.71875rem] font-medium shadow-xs transition-opacity"
                          >
                            <span>Dùng prompt</span>
                            <ArrowRight size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenWorkPromptLibraryPage;
