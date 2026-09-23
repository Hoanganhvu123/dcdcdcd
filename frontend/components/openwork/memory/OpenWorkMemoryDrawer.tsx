'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Brain,
  Plus,
  Search,
  X,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Download,
  Upload,
  RotateCcw,
  Check,
  Sparkles,
  Calculator,
  ShieldAlert,
  Sliders,
  HelpCircle,
  Tag,
  ArrowUpDown,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type AgentMemoryCard,
  type MemoryCardType,
  getGlobalMemories,
  addGlobalMemory,
  updateGlobalMemory,
  deleteGlobalMemory,
  toggleGlobalMemory,
  togglePinGlobalMemory,
  resetGlobalMemoriesToDefault,
  exportMemoriesToJson,
  importMemoriesFromJson,
} from '@/lib/memory/globalMemoryStore';
import { toast } from 'sonner';

export interface OpenWorkMemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  memories?: AgentMemoryCard[];
  onAddMemory?: (card: Omit<AgentMemoryCard, 'id' | 'createdAt' | 'updatedAt'>) => AgentMemoryCard;
  onUpdateMemory?: (id: string, updates: Partial<AgentMemoryCard>) => void;
  onDeleteMemory?: (id: string) => void;
  onToggleMemory?: (id: string, isEnabled?: boolean) => void;
  onTogglePin?: (id: string, isPinned?: boolean) => void;
  onImportMemories?: (json: string) => { importedCount: number; errors: string[] };
  onExportMemories?: () => string;
  onResetToDefaults?: () => void;
}

const TYPE_CONFIG: Record<
  MemoryCardType,
  {
    label: string;
    icon: React.ComponentType<any>;
    badgeClass: string;
    bgHover: string;
  }
> = {
  formula: {
    label: 'Công thức',
    icon: Calculator,
    badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20 hover:bg-sky-500/15',
    bgHover: 'hover:border-sky-500/40',
  },
  rule: {
    label: 'Quy tắc',
    icon: ShieldAlert,
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/15',
    bgHover: 'hover:border-amber-500/40',
  },
  assumption: {
    label: 'Giả định',
    icon: Sliders,
    badgeClass: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20 hover:bg-purple-500/15',
    bgHover: 'hover:border-purple-500/40',
  },
  preference: {
    label: 'Sở thích',
    icon: Sparkles,
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/15',
    bgHover: 'hover:border-emerald-500/40',
  },
};

type FilterCategory = 'all' | MemoryCardType;

export const OpenWorkMemoryDrawer: React.FC<OpenWorkMemoryDrawerProps> = ({
  isOpen,
  onClose,
  memories: controlledMemories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onToggleMemory,
  onTogglePin,
  onImportMemories,
  onExportMemories,
  onResetToDefaults,
}) => {
  // Local fallback state if not controlled from parent store
  const [localMemories, setLocalMemories] = useState<AgentMemoryCard[]>(() => getGlobalMemories());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with store or fallback
  const rawMemories = controlledMemories || localMemories;

  const refreshMemories = () => {
    setLocalMemories(getGlobalMemories());
  };

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<FilterCategory>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState<{
    type: MemoryCardType;
    title: string;
    category: string;
    content: string;
    tags: string;
    isPinned: boolean;
  }>({
    type: 'formula',
    title: '',
    category: 'Finance',
    content: '',
    tags: '',
    isPinned: false,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Filtered memory cards
  const filteredMemories = useMemo(() => {
    return rawMemories
      .filter((card) => {
        if (selectedType !== 'all' && card.type !== selectedType) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          card.title.toLowerCase().includes(q) ||
          card.content.toLowerCase().includes(q) ||
          card.category.toLowerCase().includes(q) ||
          card.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // Pinned first, then newest
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [rawMemories, selectedType, searchQuery]);

  const activeCount = useMemo(() => {
    return rawMemories.filter((m) => m.isEnabled !== false).length;
  }, [rawMemories]);

  // Handle Card Actions
  const handleToggle = (id: string, currentState: boolean) => {
    if (onToggleMemory) {
      onToggleMemory(id, !currentState);
    } else {
      toggleGlobalMemory(id, !currentState);
      refreshMemories();
    }
    toast.success(currentState ? 'Đã tắt quy tắc khỏi hệ thống' : 'Đã kích hoạt quy tắc vào hệ thống');
  };

  const handleTogglePin = (id: string, currentPinned: boolean) => {
    if (onTogglePin) {
      onTogglePin(id, !currentPinned);
    } else {
      togglePinGlobalMemory(id, !currentPinned);
      refreshMemories();
    }
    toast.success(currentPinned ? 'Đã bỏ ghim ưu tiên' : 'Đã ghim ưu tiên hàng đầu');
  };

  const handleDelete = (id: string, title: string) => {
    if (onDeleteMemory) {
      onDeleteMemory(id);
    } else {
      deleteGlobalMemory(id);
      refreshMemories();
    }
    toast.success(`Đã xóa "${title}"`);
  };

  const handleOpenEdit = (card: AgentMemoryCard) => {
    setEditingCardId(card.id);
    setFormData({
      type: card.type,
      title: card.title,
      category: card.category,
      content: card.content,
      tags: card.tags.join(', '),
      isPinned: card.isPinned,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const handleOpenCreate = () => {
    setEditingCardId(null);
    setFormData({
      type: 'formula',
      title: '',
      category: 'Finance',
      content: '',
      tags: '',
      isPinned: false,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formData.title.trim()) errors.title = 'Vui lòng nhập tiêu đề tri thức';
    if (!formData.content.trim()) errors.content = 'Vui lòng nhập nội dung hoặc công thức';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const tagArray = formData.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingCardId) {
      // Update
      if (onUpdateMemory) {
        onUpdateMemory(editingCardId, {
          type: formData.type,
          title: formData.title.trim(),
          category: formData.category.trim() || 'General',
          content: formData.content.trim(),
          tags: tagArray,
          isPinned: formData.isPinned,
        });
      } else {
        updateGlobalMemory(editingCardId, {
          type: formData.type,
          title: formData.title.trim(),
          category: formData.category.trim() || 'General',
          content: formData.content.trim(),
          tags: tagArray,
          isPinned: formData.isPinned,
        });
        refreshMemories();
      }
      toast.success('Đã cập nhật tri thức thành công');
    } else {
      // Create
      if (onAddMemory) {
        onAddMemory({
          type: formData.type,
          title: formData.title.trim(),
          category: formData.category.trim() || 'General',
          content: formData.content.trim(),
          tags: tagArray,
          isPinned: formData.isPinned,
          isEnabled: true,
          confidence: 1.0,
          sourceSessionId: 'manual',
        });
      } else {
        addGlobalMemory({
          type: formData.type,
          title: formData.title.trim(),
          category: formData.category.trim() || 'General',
          content: formData.content.trim(),
          tags: tagArray,
          isPinned: formData.isPinned,
          isEnabled: true,
          confidence: 1.0,
          sourceSessionId: 'manual',
        });
        refreshMemories();
      }
      toast.success('Đã thêm tri thức mới vào Global Memory');
    }

    setIsFormOpen(false);
    setEditingCardId(null);
  };

  const handleExport = () => {
    try {
      const json = onExportMemories ? onExportMemories() : exportMemoriesToJson(rawMemories);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `openwork_global_memories_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Đã xuất thành công tệp JSON bộ nhớ');
    } catch (err) {
      toast.error('Lỗi khi xuất tệp JSON');
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        if (onImportMemories) {
          const res = onImportMemories(content);
          if (res.errors && res.errors.length > 0) {
            toast.error(`Lỗi nhập: ${res.errors.join('; ')}`);
          } else {
            toast.success(`Đã nhập thành công ${res.importedCount} thẻ tri thức`);
          }
        } else {
          const res = importMemoriesFromJson(content);
          if (res.errors.length > 0) {
            toast.error(`Lỗi nhập: ${res.errors.join('; ')}`);
          } else {
            toast.success(`Đã nhập thành công ${res.importedCount} thẻ tri thức`);
            refreshMemories();
          }
        }
      }
    };
    reader.readAsText(file);
    // reset input
    e.target.value = '';
  };

  const handleResetDefaults = () => {
    if (window.confirm('Bạn có chắc chắn muốn khôi phục toàn bộ tri thức về cấu hình mẫu mặc định?')) {
      if (onResetToDefaults) {
        onResetToDefaults();
      } else {
        resetGlobalMemoriesToDefault();
        refreshMemories();
      }
      toast.success('Đã khôi phục các quy tắc mẫu doanh nghiệp');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl p-0 flex flex-col h-full bg-background border-l border-border/80 shadow-2xl z-50 select-none"
        data-testid="openwork-memory-drawer"
      >
        {/* ── 1. Top Header with Gradient Accent ── */}
        <div className="p-4 sm:p-5 border-b border-border/60 bg-muted/20 shrink-0">
          <SheetHeader className="text-left space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-xs shrink-0">
                  <Brain className="w-4.5 h-4.5" />
                </div>
                <div>
                  <SheetTitle className="text-base sm:text-lg font-semibold text-foreground tracking-tight flex items-center gap-2">
                    <span>Bộ Nhớ Toàn Cục (Global Memory)</span>
                    <Badge variant="outline" className="text-[0.6875rem] font-normal px-2 py-0 h-5 bg-background border-border/70">
                      {activeCount}/{rawMemories.length} Đang chạy
                    </Badge>
                  </SheetTitle>
                </div>
              </div>

              <button
                type="button"
                data-testid="memory-add-button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all shadow-xs shrink-0 cursor-pointer active:scale-95"
              >
                <Plus size={14} />
                <span>Thêm Tri Thức</span>
              </button>
            </div>

            <SheetDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
              Tri thức kinh doanh, công thức doanh thu & quy tắc kế thừa tự động cho mọi phiên hội thoại.
            </SheetDescription>
          </SheetHeader>

          {/* ── Search & Filter Tabs ── */}
          <div className="mt-3.5 space-y-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm công thức, quy tắc, thuế, VAT, chiết khấu..."
                data-testid="memory-search-input"
                className="w-full h-8 pl-8 pr-8 rounded-md bg-background border border-border/80 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-sans"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar text-xs">
              <button
                type="button"
                onClick={() => setSelectedType('all')}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[0.71875rem] font-medium transition-all shrink-0 cursor-pointer border',
                  selectedType === 'all'
                    ? 'bg-foreground text-background border-foreground shadow-xs'
                    : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground'
                )}
              >
                Tất cả ({rawMemories.length})
              </button>

              {(['formula', 'rule', 'assumption', 'preference'] as MemoryCardType[]).map((type) => {
                const config = TYPE_CONFIG[type];
                const count = rawMemories.filter((m) => m.type === type).length;
                const Icon = config.icon;
                const isSelected = selectedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.71875rem] font-medium transition-all shrink-0 cursor-pointer border',
                      isSelected
                        ? config.badgeClass + ' font-semibold ring-1 ring-current shadow-xs'
                        : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon size={12} />
                    <span>{config.label}</span>
                    <span className="text-[0.625rem] opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 2. Add / Edit Card Form (Slide Down) ── */}
        {isFormOpen && (
          <div className="p-4 bg-muted/30 border-b border-border/80 animate-in slide-in-from-top duration-200 shrink-0">
            <form onSubmit={handleSaveForm} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Brain size={13} className="text-primary" />
                  {editingCardId ? 'Chỉnh sửa thẻ tri thức' : 'Thêm thẻ tri thức mới'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Type Selection */}
                <div>
                  <label className="block text-[0.6875rem] font-medium text-muted-foreground mb-1">
                    Loại tri thức
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as MemoryCardType })}
                    className="w-full h-7.5 px-2 rounded-md bg-background border border-border text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none font-sans"
                  >
                    <option value="formula">Công thức tính toán (Formula)</option>
                    <option value="rule">Quy tắc kế toán / Nghiệp vụ (Rule)</option>
                    <option value="assumption">Giả định / Tỷ lệ hao hụt (Assumption)</option>
                    <option value="preference">Sở thích định dạng / Báo cáo (Preference)</option>
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-[0.6875rem] font-medium text-muted-foreground mb-1">
                    Lĩnh vực / Danh mục
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Finance, Tax, Retail, Agri, Omnichannel..."
                    className="w-full h-7.5 px-2 rounded-md bg-background border border-border text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none font-sans"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-[0.6875rem] font-medium text-muted-foreground mb-1">
                  Tiêu đề quy tắc <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => {
                    setFormData({ ...formData, title: e.target.value });
                    if (formErrors.title) setFormErrors({ ...formErrors, title: '' });
                  }}
                  placeholder="Ví dụ: Công thức tính Doanh thu thuần, Khấu trừ VAT 8%..."
                  className={cn(
                    'w-full h-7.5 px-2 rounded-md bg-background border text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none font-sans',
                    formErrors.title ? 'border-destructive' : 'border-border'
                  )}
                />
                {formErrors.title && (
                  <span className="text-[0.65625rem] text-destructive mt-0.5 block">{formErrors.title}</span>
                )}
              </div>

              {/* Content / Formula Body */}
              <div>
                <label className="block text-[0.6875rem] font-medium text-muted-foreground mb-1">
                  Nội dung chi tiết / Công thức toán học <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.content}
                  onChange={(e) => {
                    setFormData({ ...formData, content: e.target.value });
                    if (formErrors.content) setFormErrors({ ...formErrors, content: '' });
                  }}
                  placeholder="Ghi rõ công thức, tỷ lệ %, điều kiện hoặc logic tính toán chi tiết..."
                  className={cn(
                    'w-full p-2 rounded-md bg-background border text-xs text-foreground font-mono focus:ring-1 focus:ring-primary focus:outline-none leading-relaxed resize-none',
                    formErrors.content ? 'border-destructive' : 'border-border'
                  )}
                />
                {formErrors.content && (
                  <span className="text-[0.65625rem] text-destructive mt-0.5 block">{formErrors.content}</span>
                )}
              </div>

              {/* Tags & Pin Toggle */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex-1">
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="Tags phân loại (phân cách bằng dấu phẩy, e.g. revenue, cogs, vat)"
                    className="w-full h-7 px-2 rounded-md bg-background border border-border text-[0.6875rem] text-foreground focus:ring-1 focus:ring-primary focus:outline-none font-sans"
                  />
                </div>

                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={formData.isPinned}
                    onChange={(e) => setFormData({ ...formData, isPinned: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Ghim ưu tiên</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 shadow-xs"
                >
                  {editingCardId ? 'Cập nhật' : 'Lưu tri thức'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── 3. Memory Card List View (Scrollable) ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 space-y-2.5">
          {filteredMemories.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-muted-foreground space-y-2">
              <Brain className="w-8 h-8 opacity-30 text-muted-foreground" />
              <p className="text-xs font-medium">Không tìm thấy thẻ tri thức nào phù hợp.</p>
              <p className="text-[0.6875rem] opacity-75">
                Hãy thử thay đổi từ khóa tìm kiếm hoặc bấm "Thêm Tri Thức" để tạo mới.
              </p>
            </div>
          ) : (
            filteredMemories.map((card) => {
              const typeCfg = TYPE_CONFIG[card.type] || TYPE_CONFIG.rule;
              const Icon = typeCfg.icon;
              const isEnabled = card.isEnabled !== false;

              return (
                <div
                  key={card.id}
                  data-testid={`memory-card-${card.id}`}
                  className={cn(
                    'group relative p-3 rounded-lg border transition-all duration-150',
                    isEnabled
                      ? 'bg-card text-card-foreground border-border/80 shadow-xs hover:shadow-md'
                      : 'bg-muted/40 text-muted-foreground border-border/40 opacity-75',
                    card.isPinned && isEnabled && 'border-amber-500/40 bg-amber-500/[0.02]',
                    typeCfg.bgHover
                  )}
                >
                  {/* Top Row: Type badge, Category, Pin, Toggle & Actions */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[0.65625rem] font-semibold px-2 py-0.5 rounded-full border',
                          typeCfg.badgeClass
                        )}
                      >
                        <Icon size={11} />
                        <span>{typeCfg.label}</span>
                      </span>

                      <span className="text-[0.65625rem] text-muted-foreground font-medium truncate">
                        · {card.category}
                      </span>

                      {card.isPinned && (
                        <span
                          title="Được ghim ưu tiên hàng đầu"
                          className="inline-flex items-center gap-0.5 text-[0.625rem] font-medium px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0"
                        >
                          <Pin size={10} className="fill-current" />
                          <span>Ưu tiên</span>
                        </span>
                      )}
                    </div>

                    {/* Right action controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Pin Button */}
                      <button
                        type="button"
                        onClick={() => handleTogglePin(card.id, card.isPinned)}
                        title={card.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
                        className={cn(
                          'p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer',
                          card.isPinned && 'text-amber-500 dark:text-amber-400 font-bold'
                        )}
                      >
                        <Pin size={13} className={card.isPinned ? 'fill-current' : ''} />
                      </button>

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(card)}
                        title="Chỉnh sửa tri thức"
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Pencil size={13} />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleDelete(card.id, card.title)}
                        title="Xóa tri thức"
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>

                      {/* Enable/Disable Switch */}
                      <div className="ml-1 pl-1 border-l border-border/60">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => handleToggle(card.id, isEnabled)}
                          title={isEnabled ? 'Đang kích hoạt' : 'Đã tắt'}
                          aria-label={`Toggle ${card.title}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Title */}
                  <h4 className="text-xs sm:text-[0.8125rem] font-medium text-foreground tracking-tight mb-1 font-sans">
                    {card.title}
                  </h4>

                  {/* Content / Formula */}
                  <div className="p-2 rounded bg-muted/60 border border-border/40 font-mono text-[0.6875rem] leading-relaxed text-foreground/90 whitespace-pre-wrap select-text break-words">
                    {card.content}
                  </div>

                  {/* Tags & Footer Info */}
                  <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-border/30 text-[0.625rem] text-muted-foreground">
                    <div className="flex items-center gap-1 flex-wrap">
                      {card.tags && card.tags.length > 0 && (
                        card.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-muted text-[0.625rem] text-muted-foreground"
                          >
                            <Tag size={9} />
                            <span>{tag}</span>
                          </span>
                        ))
                      )}
                    </div>

                    <span className="shrink-0 opacity-70">
                      {card.sourceSessionId === 'enterprise-seed'
                        ? 'Mặc định doanh nghiệp'
                        : card.sourceSessionId === 'manual'
                        ? 'Thêm thủ công'
                        : 'Tự động trích xuất'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── 4. Bottom Footer with Import/Export/Reset Controls ── */}
        <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/10 shrink-0 flex items-center justify-between gap-2">
          {/* Hidden File Input for JSON import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFileChange}
            accept=".json,application/json"
            className="hidden"
          />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExport}
              title="Xuất toàn bộ bộ nhớ ra tệp JSON"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-foreground text-xs font-medium transition-colors cursor-pointer shadow-xs"
            >
              <Download size={13} />
              <span>Xuất JSON</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Nhập các quy tắc từ tệp JSON"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted text-foreground text-xs font-medium transition-colors cursor-pointer shadow-xs"
            >
              <Upload size={13} />
              <span>Nhập JSON</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetDefaults}
            title="Khôi phục các quy tắc kinh doanh mặc định"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Mặc định</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default OpenWorkMemoryDrawer;
