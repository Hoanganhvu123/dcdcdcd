import React, { useState } from 'react';
import { Sparkles, Check, ArrowRight, ArrowLeft, Database, Cpu, FileSpreadsheet, Presentation, UserCheck, ShieldCheck, CheckCircle2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OpenWorkOnboardingPageProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export const OpenWorkOnboardingPage: React.FC<OpenWorkOnboardingPageProps> = ({
  onComplete,
  onSkip,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1 State
  const [selectedRole, setSelectedRole] = useState<string>('analyst');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(['sql', 'excel']);

  // Step 2 State
  const [dbType, setDbType] = useState<string>('sample');
  const [isTestingConn, setIsTestingConn] = useState<boolean>(false);
  const [connSuccess, setConnSuccess] = useState<boolean>(true);

  // Step 3 State
  const [enabledSkills, setEnabledSkills] = useState<string[]>([
    'sql_analyst',
    'spreadsheet_studio',
    'presentation_studio',
    'python_sandbox',
  ]);
  const [selectedStarterPrompt, setSelectedStarterPrompt] = useState<string>('p1');

  const toggleGoal = (goal: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    );
  };

  const toggleSkill = (skill: string) => {
    setEnabledSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const handleTestConnection = () => {
    setIsTestingConn(true);
    setTimeout(() => {
      setIsTestingConn(false);
      setConnSuccess(true);
    }, 800);
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onComplete?.();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((prev) => prev - 1);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[var(--bg)] text-[var(--fg)] select-none custom-scrollbar">
      {/* ── 1. Top Mini Bar ── */}
      <div className="h-[44px] flex items-center justify-between px-6 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2">
          <div className="w-5.5 h-5.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center font-mono text-[0.625rem] font-semibold">
            OW
          </div>
          <span className="text-[0.8125rem] font-medium tracking-tight">OpenWork Thiết lập Ban đầu</span>
        </div>

        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-[0.75rem] text-[var(--muted-fg)] hover:text-[var(--fg)] transition-colors"
          >
            Bỏ qua & Vào màn hình chính
          </button>
        )}
      </div>

      {/* ── 2. Wizard Container ── */}
      <div className="max-w-[680px] w-full mx-auto my-auto px-4 py-8 flex flex-col gap-6">
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between border-b border-[var(--hair)] pb-4">
          {[
            { num: 1, title: 'Vai trò & Mục tiêu' },
            { num: 2, title: 'Nguồn dữ liệu' },
            { num: 3, title: 'Kỹ năng & Bắt đầu' },
          ].map((s) => {
            const isDone = currentStep > s.num;
            const isCurrent = currentStep === s.num;
            return (
              <div key={s.num} className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full font-mono text-[0.6875rem] font-semibold flex items-center justify-center transition-colors',
                    isDone
                      ? 'bg-[var(--ok)] text-white'
                      : isCurrent
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--muted)] text-[var(--muted-fg)] border border-[var(--border)]'
                  )}
                >
                  {isDone ? <Check size={12} /> : s.num}
                </div>
                <span
                  className={cn(
                    'text-[0.75rem] hidden sm:inline font-medium',
                    isCurrent ? 'text-[var(--fg)]' : 'text-[var(--muted-fg)]'
                  )}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Role & Goals ── */}
        {currentStep === 1 && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-150">
            <div>
              <h2 className="text-[1.125rem] font-semibold tracking-tight text-[var(--fg)]">
                Chào mừng bạn đến với OpenWork! Hãy chọn vai trò của bạn.
              </h2>
              <p className="text-[0.78125rem] text-[var(--muted-fg)] mt-1">
                Chúng tôi sẽ tối ưu hóa giao diện phân tích và gợi ý prompt phù hợp nhất cho bạn.
              </p>
            </div>

            {/* Roles Grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'analyst', title: 'Data Analyst / BI', desc: 'Viết SQL, chạy Python & dựng Dashboard' },
                { id: 'manager', title: 'Quản lý / Trưởng phòng', desc: 'Theo dõi KPI, đối soát doanh thu & chi phí' },
                { id: 'dev', title: 'Developer / Data Engineer', desc: 'Quản trị MCP, kết nối DB & API Keys' },
                { id: 'executive', title: 'Ban Điều Hành (C-Level)', desc: 'Xem slide thuyết trình 16:9 & báo cáo Word' },
              ].map((r) => {
                const isSelected = selectedRole === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRole(r.id)}
                    className={cn(
                      'border rounded-xl p-3.5 cursor-pointer transition-all flex flex-col justify-between min-h-[90px]',
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]/20 ring-1 ring-[var(--accent)] shadow-sm'
                        : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]/40'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[0.8125rem] font-medium text-[var(--fg)]">{r.title}</span>
                      <div
                        className={cn(
                          'w-4 h-4 rounded-full border flex items-center justify-center shrink-0',
                          isSelected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--muted-fg)]'
                        )}
                      >
                        {isSelected && <Check size={10} className="text-white" />}
                      </div>
                    </div>
                    <span className="text-[0.71875rem] text-[var(--muted-fg)] mt-1 leading-relaxed">
                      {r.desc}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Goals Selection */}
            <div>
              <label className="text-[0.75rem] font-medium text-[var(--fg)] block mb-2">
                Bạn muốn thực hiện tác vụ nào thường xuyên nhất?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'sql', label: 'Truy vấn & sinh SQL tự động' },
                  { id: 'excel', label: 'Tạo bảng tính Excel đa sheet (XLSX)' },
                  { id: 'slide', label: 'Soạn bài thuyết trình Slide 16:9' },
                  { id: 'word', label: 'Viết tài liệu báo cáo điều hành Word A4' },
                ].map((g) => {
                  const isChecked = selectedGoals.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGoal(g.id)}
                      className={cn(
                        'p-2.5 rounded-lg border text-left text-[0.75rem] flex items-center justify-between transition-colors',
                        isChecked
                          ? 'border-[var(--primary)] bg-[var(--card)] text-[var(--fg)] font-medium shadow-xs'
                          : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-fg)] hover:text-[var(--fg)]'
                      )}
                    >
                      <span>{g.label}</span>
                      {isChecked && <Check size={13} className="text-[var(--ok)] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: First Datasource Connection ── */}
        {currentStep === 2 && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-150">
            <div>
              <h2 className="text-[1.125rem] font-semibold tracking-tight text-[var(--fg)]">
                Kết nối Nguồn dữ liệu đầu tiên của bạn
              </h2>
              <p className="text-[0.78125rem] text-[var(--muted-fg)] mt-1">
                OpenWork chỉ đọc metadata lược đồ (Schema) và thực thi câu truy vấn phân tích an toàn.
              </p>
            </div>

            {/* Sample DB vs Custom DB Switch */}
            <div className="flex flex-col gap-3">
              <div
                onClick={() => setDbType('sample')}
                className={cn(
                  'border rounded-xl p-3.5 cursor-pointer transition-all flex items-start gap-3 bg-[var(--card)]',
                  dbType === 'sample'
                    ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--accent-soft)]/10'
                    : 'border-[var(--border)] hover:bg-[var(--muted)]/30'
                )}
              >
                <Database size={18} className="text-[var(--c2)] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.8125rem] font-medium text-[var(--fg)]">
                      Sử dụng Cơ sở dữ liệu mẫu có sẵn (Khuyên dùng để thử nghiệm)
                    </span>
                    <span className="text-[0.625rem] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-medium">
                      Đã kết nối
                    </span>
                  </div>
                  <p className="text-[0.71875rem] text-[var(--muted-fg)] mt-1 leading-relaxed">
                    Bao gồm 14 bảng bán lẻ, 719.420 đơn hàng thực tế, sản phẩm, khách hàng và chuỗi doanh thu 4 quý.
                  </p>
                </div>
              </div>

              <div
                onClick={() => setDbType('custom')}
                className={cn(
                  'border rounded-xl p-3.5 cursor-pointer transition-all flex items-start gap-3 bg-[var(--card)]',
                  dbType === 'custom'
                    ? 'border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--accent-soft)]/10'
                    : 'border-[var(--border)] hover:bg-[var(--muted)]/30'
                )}
              >
                <Database size={18} className="text-[var(--muted-fg)] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[0.8125rem] font-medium text-[var(--fg)]">
                    Kết nối Cơ sở dữ liệu PostgreSQL / MySQL của công ty bạn
                  </div>
                  <p className="text-[0.71875rem] text-[var(--muted-fg)] mt-1 leading-relaxed">
                    Nhập Host, Port, Database Name và tài khoản Read-Only để kết nối trực tiếp.
                  </p>
                </div>
              </div>
            </div>

            {dbType === 'custom' && (
              <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--panel)]/40 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[0.6875rem] text-[var(--muted-fg)] block mb-1">Host / Endpoint</label>
                    <input
                      type="text"
                      defaultValue="db.internal.congty.vn"
                      className="w-full h-7 px-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[0.75rem] text-[var(--fg)]"
                    />
                  </div>
                  <div>
                    <label className="text-[0.6875rem] text-[var(--muted-fg)] block mb-1">Port</label>
                    <input
                      type="text"
                      defaultValue="5432"
                      className="w-full h-7 px-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[0.75rem] text-[var(--fg)]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[0.6875rem] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Sẵn sàng kết nối SSL
                  </span>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    className="h-6.5 px-3 rounded-lg border border-[var(--border)] bg-[var(--card)] text-[0.71875rem] font-medium flex items-center gap-1.5"
                  >
                    {isTestingConn && <RefreshCw size={11} className="animate-spin" />}
                    <span>Kiểm tra kết nối</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Skills Activation & Starter Prompt ── */}
        {currentStep === 3 && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-150">
            <div>
              <h2 className="text-[1.125rem] font-semibold tracking-tight text-[var(--fg)]">
                Kích hoạt Kỹ năng phân tích & Chọn prompt khởi động
              </h2>
              <p className="text-[0.78125rem] text-[var(--muted-fg)] mt-1">
                Các kỹ năng giúp AI tự động tạo Artifacts trực quan và chạy phân tích chuyên sâu.
              </p>
            </div>

            {/* Skills Checklist */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'sql_analyst', name: 'SQL Data Analyst', desc: 'Sinh và tối ưu SQL' },
                { id: 'spreadsheet_studio', name: 'Spreadsheet Studio', desc: 'Tạo file XLSX đa sheet' },
                { id: 'presentation_studio', name: 'Presentation Studio', desc: 'Soạn Slide 16:9' },
                { id: 'python_sandbox', name: 'Python Sandbox', desc: 'Phân tích ARIMA & Pareto' },
              ].map((sk) => {
                const isEnabled = enabledSkills.includes(sk.id);
                return (
                  <div
                    key={sk.id}
                    onClick={() => toggleSkill(sk.id)}
                    className={cn(
                      'p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-colors',
                      isEnabled
                        ? 'border-[var(--border)] bg-[var(--card)] ring-1 ring-[var(--accent)]/30'
                        : 'border-[var(--border)] bg-[var(--panel)] opacity-60'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-[0.78125rem] font-medium text-[var(--fg)]">{sk.name}</div>
                      <div className="text-[0.65625rem] text-[var(--muted-fg)] truncate">{sk.desc}</div>
                    </div>
                    <div
                      className={cn(
                        'w-4 h-4 rounded-md border flex items-center justify-center shrink-0',
                        isEnabled ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--muted-fg)]'
                      )}
                    >
                      {isEnabled && <Check size={11} />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Starter Prompt Cards */}
            <div>
              <label className="text-[0.75rem] font-medium text-[var(--fg)] block mb-2">
                Chọn câu hỏi đầu tiên bạn muốn OpenWork giải quyết:
              </label>
              <div className="flex flex-col gap-2">
                {[
                  {
                    id: 'p1',
                    text: 'Phân tích doanh thu và biên lợi nhuận gộp 4 quý gần nhất từ PostgreSQL DW, xuất bảng tính Excel.',
                  },
                  {
                    id: 'p2',
                    text: 'Tìm top 20% khách hàng đóng góp 80% doanh thu (Pareto) và gợi ý kịch bản chăm sóc VIP.',
                  },
                ].map((p) => {
                  const isPSelected = selectedStarterPrompt === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedStarterPrompt(p.id)}
                      className={cn(
                        'p-3 rounded-xl border cursor-pointer transition-all text-[0.75rem] leading-relaxed flex items-center justify-between gap-3',
                        isPSelected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]/20 font-medium text-[var(--fg)]'
                          : 'border-[var(--border)] bg-[var(--card)] text-[var(--muted-fg)] hover:text-[var(--fg)]'
                      )}
                    >
                      <span>"{p.text}"</span>
                      {isPSelected && <Check size={14} className="text-[var(--accent)] shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Wizard Footer Buttons ── */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--hair)]">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              className="h-8 px-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[0.75rem] font-medium text-[var(--fg2)] hover:bg-[var(--muted)] flex items-center gap-1.5"
            >
              <ArrowLeft size={13} />
              <span>Quay lại</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNext}
            className="h-8 px-4 rounded-xl border-0 bg-[var(--primary)] text-[var(--primary-fg)] text-[0.75rem] font-medium flex items-center gap-1.5 shadow-xs hover:opacity-90 transition-opacity"
          >
            <span>{currentStep === 3 ? 'Hoàn tất & Bắt đầu làm việc' : 'Tiếp tục'}</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpenWorkOnboardingPage;
