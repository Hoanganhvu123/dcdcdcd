import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, LayoutDashboard, Database, Cpu, Key, Users, Shield, CreditCard, Sparkles, MessageSquare, FileSpreadsheet, Presentation, FileText, ArrowRight, CornerDownLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OpenWorkView } from '../useOpenWorkStore';

export interface CommandItem {
  id: string;
  category: 'navigation' | 'action' | 'table';
  title: string;
  desc?: string;
  icon: React.ReactNode;
  shortcut?: string;
  viewTarget?: OpenWorkView;
  action?: () => void;
}

export interface OpenWorkCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate?: (view: OpenWorkView) => void;
  onNewChat?: () => void;
}

export const OpenWorkCommandPalette: React.FC<OpenWorkCommandPaletteProps> = ({
  open,
  onClose,
  onNavigate,
  onNewChat,
}) => {
  const [query, setQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = useMemo(
    () => [
      // Navigation
      {
        id: 'nav-chat',
        category: 'navigation',
        title: 'Màn hình Chat & Trợ lý Phân tích',
        desc: 'Trò chuyện phân tích dữ liệu, sinh SQL & Artifacts',
        icon: <MessageSquare size={14} className="text-[var(--accent)]" />,
        shortcut: '⌘1',
        viewTarget: 'chat',
      },
      {
        id: 'nav-dash',
        category: 'navigation',
        title: 'Bảng điều khiển Tổng quan (Dashboard)',
        desc: 'Xem 4 KPI sparklines, doanh thu 4 quý và biểu đồ kênh',
        icon: <LayoutDashboard size={14} className="text-[var(--c1)]" />,
        shortcut: '⌘2',
        viewTarget: 'dashboard',
      },
      {
        id: 'nav-ds',
        category: 'navigation',
        title: 'Quản lý Nguồn dữ liệu (Datasource)',
        desc: 'Xem 5 kết nối DB, kiểm tra schema bảng và dữ liệu mẫu',
        icon: <Database size={14} className="text-[var(--c2)]" />,
        shortcut: '⌘3',
        viewTarget: 'datasource',
      },
      {
        id: 'nav-skills',
        category: 'navigation',
        title: 'Kỹ năng Phân tích & Máy chủ MCP',
        desc: 'Cấu hình 9 tool skills và kết nối MCP servers',
        icon: <Cpu size={14} className="text-[var(--c3)]" />,
        shortcut: '⌘4',
        viewTarget: 'skills',
      },
      {
        id: 'nav-keys',
        category: 'navigation',
        title: 'Khóa API & Giới hạn Tỷ lệ',
        desc: 'Quản lý API tokens, rate limits và lưu lượng truy cập',
        icon: <Key size={14} className="text-[var(--c4)]" />,
        viewTarget: 'keys',
      },
      {
        id: 'nav-members',
        category: 'navigation',
        title: 'Thành viên & Ma trận Phân quyền',
        desc: 'Mời thành viên, chỉnh vai trò và kiểm tra quyền hạn',
        icon: <Users size={14} className="text-[var(--accent)]" />,
        viewTarget: 'members',
      },
      {
        id: 'nav-audit',
        category: 'navigation',
        title: 'Nhật ký Kiểm toán (Audit Log)',
        desc: 'Xem dòng sự kiện bảo mật, chi tiết truy vấn và xuất CSV',
        icon: <Shield size={14} className="text-[var(--c5)]" />,
        viewTarget: 'audit',
      },
      {
        id: 'nav-billing',
        category: 'navigation',
        title: 'Thanh toán & Hóa đơn',
        desc: 'Xem mức dùng gói, biểu đồ chi phí 6 tháng và hóa đơn',
        icon: <CreditCard size={14} className="text-[var(--c1)]" />,
        viewTarget: 'billing',
      },
      {
        id: 'nav-pricing',
        category: 'navigation',
        title: 'Bảng giá 4 Gói Dịch vụ',
        desc: 'So sánh gói Nhóm, Doanh nghiệp, Enterprise & Edu',
        icon: <Sparkles size={14} className="text-amber-500" />,
        viewTarget: 'pricing',
      },
      // Actions
      {
        id: 'act-new-chat',
        category: 'action',
        title: 'Tạo phiên phân tích dữ liệu mới',
        desc: 'Bắt đầu cuộc trò chuyện mới với dữ liệu sạch',
        icon: <Sparkles size={14} className="text-[var(--accent)]" />,
        shortcut: '⌘N',
        action: () => {
          onNewChat?.();
          onNavigate?.('chat');
        },
      },
      {
        id: 'act-export-xlsx',
        category: 'action',
        title: 'Mở Spreadsheet Studio (Bảng tính XLSX)',
        desc: 'Xem bảng tính đa sheet và công thức Excel trực quan',
        icon: <FileSpreadsheet size={14} className="text-emerald-500" />,
        viewTarget: 'artifact-detail',
      },
      {
        id: 'act-prompt-lib',
        category: 'action',
        title: 'Thư viện Prompt Mẫu',
        desc: '12 mẫu prompt phân tích doanh thu, khách hàng & SQL',
        icon: <FileText size={14} className="text-sky-500" />,
        viewTarget: 'prompts',
      },
      // Tables
      {
        id: 'tbl-orders',
        category: 'table',
        title: 'Bảng `fact_orders` (719.420 dòng)',
        desc: 'PostgreSQL · Cập nhật 09:38',
        icon: <Database size={14} className="text-[var(--muted-fg)]" />,
        viewTarget: 'datasource',
      },
      {
        id: 'tbl-products',
        category: 'table',
        title: 'Bảng `dim_products` (1.420 SKU)',
        desc: 'PostgreSQL · Danh mục sản phẩm & giá vốn',
        icon: <Database size={14} className="text-[var(--muted-fg)]" />,
        viewTarget: 'datasource',
      },
    ],
    [onNavigate, onNewChat]
  );

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.desc?.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev <= 0 ? Math.max(0, filteredCommands.length - 1) : prev - 1
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          executeCommand(selected);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filteredCommands, selectedIndex]);

  const executeCommand = (cmd: CommandItem) => {
    if (cmd.action) {
      cmd.action();
    } else if (cmd.viewTarget && onNavigate) {
      onNavigate(cmd.viewTarget);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-100 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Input Bar ── */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--hair)] bg-[var(--card)]">
          <Search size={16} className="text-[var(--muted-fg)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gõ lệnh, tìm trang, truy vấn hoặc bảng dữ liệu… (Esc để đóng)"
            className="flex-1 bg-transparent text-[0.84375rem] text-[var(--fg)] placeholder:text-[var(--muted-fg)] outline-none border-0"
          />
          <kbd className="font-mono text-[0.65625rem] text-[var(--muted-fg)] bg-[var(--panel)] border border-[var(--border)] px-1.5 py-0.5 rounded-md">
            ESC
          </kbd>
        </div>

        {/* ── Results List ── */}
        <div className="max-h-[360px] overflow-y-auto p-2 flex flex-col gap-0.5 custom-scrollbar">
          {filteredCommands.length === 0 ? (
            <div className="py-10 text-center text-[0.75rem] text-[var(--muted-fg)]">
              Không tìm thấy lệnh hoặc dữ liệu phù hợp với "{query}"
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-[var(--muted)] text-[var(--fg)]'
                      : 'text-[var(--fg2)] hover:bg-[var(--muted)]/50 hover:text-[var(--fg)]'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0">{cmd.icon}</div>
                    <div className="min-w-0">
                      <div className="text-[0.78125rem] font-medium truncate">{cmd.title}</div>
                      {cmd.desc && (
                        <div className="text-[0.6875rem] text-[var(--muted-fg)] truncate mt-0.2">
                          {cmd.desc}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {cmd.shortcut && (
                      <kbd className="font-mono text-[0.625rem] text-[var(--muted-fg)] bg-[var(--bg)] border border-[var(--hair)] px-1.5 py-0.5 rounded">
                        {cmd.shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <CornerDownLeft size={13} className="text-[var(--accent)]" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer Keyboard Tips ── */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--hair)] bg-[var(--panel)]/50 text-[0.65625rem] text-[var(--muted-fg)]">
          <div className="flex items-center gap-3">
            <span>
              <strong className="font-mono">↑↓</strong> Di chuyển
            </span>
            <span>
              <strong className="font-mono">↵</strong> Chọn lệnh
            </span>
          </div>
          <span>DB-GPT OpenWork v2.4</span>
        </div>
      </div>
    </div>
  );
};

export default OpenWorkCommandPalette;
