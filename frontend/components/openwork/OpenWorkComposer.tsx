import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUp,
  Square,
  Paperclip,
  ChevronDown,
  Database,
  Check,
  Search,
  FileText,
  X,
  Sparkles,
} from 'lucide-react';
import type { DatasourceItem } from './types';
import { PROVIDER_MODEL_CATALOG } from './types';
import { cn } from '@/lib/utils';
import type { SlashCommandDefinition } from './slash-commands/slash-commands';
import { filterSlashCommands } from './slash-commands/slash-commands';
import { OpenWorkSlashMenu } from './slash-commands/OpenWorkSlashMenu';
import './styles/openwork-composer.css';

export type { DatasourceItem };
export type { SlashCommandDefinition };

const DEFAULT_DATASOURCES: DatasourceItem[] = [
  { id: 'sqlite_ecommerce', name: 'SQLite (eCommerce DB)', type: 'sqlite', tablesCount: 6, status: 'connected', description: 'Đơn hàng, khách hàng & doanh thu bán lẻ', isDefault: true },
  { id: 'postgres_analytics', name: 'PostgreSQL (Sales Analytics)', type: 'postgres', tablesCount: 14, status: 'connected', description: 'Kho dữ liệu kinh doanh đa kênh' },
  { id: 'clickhouse_telemetry', name: 'ClickHouse (User Logs)', type: 'clickhouse', tablesCount: 8, status: 'connected', description: 'Nhật ký hành vi & truy vết phiên' },
  { id: 'financial_q3_xlsx', name: 'Financial_Reports_Q3.xlsx', type: 'excel', tablesCount: 4, status: 'connected', description: 'Bảng tính PnL & dòng tiền 2026' },
];

export const DEFAULT_MODELS = [
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'OpenRouter', description: 'Mô hình DeepSeek V4 Flash qua cổng OpenRouter Gateway', tag: 'Chính Thức' },
];

export interface OpenWorkComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  selectedModel?: string;
  availableModels?: string[];
  onSelectModel?: (model: string) => void;
  showModelSelector?: boolean;
  selectedDatasource?: DatasourceItem | string | null;
  selectedDatasourceId?: string | null;
  availableDatasources?: DatasourceItem[];
  onSelectDatasource?: (ds: DatasourceItem) => void;
  placeholder?: string;
  onOpenSettings?: () => void;
  planMode?: 'plan' | 'direct';
  onPlanModeChange?: (mode: 'plan' | 'direct') => void;
  reasoningMode?: string;
  onReasoningModeChange?: (mode: string) => void;
  onSelectSlashCommand?: (command: SlashCommandDefinition) => void;
  tokenMeta?: string;
  workbenchOpen?: boolean;
  disabled?: boolean;
  className?: string;
}

export const OpenWorkComposer: React.FC<OpenWorkComposerProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming = false,
  selectedModel = 'deepseek-v4-flash',
  availableModels,
  onSelectModel,
  showModelSelector = true,
  selectedDatasource: initialDatasource,
  selectedDatasourceId,
  availableDatasources = DEFAULT_DATASOURCES,
  onSelectDatasource,
  placeholder = 'Hỏi về dữ liệu, yêu cầu phân tích, tạo báo cáo...',
  onOpenSettings,
  planMode: externalPlanMode,
  onPlanModeChange,
  reasoningMode,
  onReasoningModeChange,
  onSelectSlashCommand,
  tokenMeta,
  workbenchOpen,
  disabled = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dsDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const slashDropdownRef = useRef<HTMLDivElement>(null);

  const [isNarrow, setIsNarrow] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkWidth = () => {
      setIsMobile(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
      if (containerRef.current) {
        setIsNarrow(containerRef.current.offsetWidth < 550);
      }
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsNarrow(entry.contentRect.width < 550);
      }
    }) : null;
    if (containerRef.current && observer) {
      observer.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', checkWidth);
      observer?.disconnect();
    };
  }, []);

  const isCompact = isNarrow || isMobile || !!workbenchOpen;

  const [localPlanMode, setLocalPlanMode] = useState<'plan' | 'direct'>('plan');
  const [dsOpen, setDsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [internalSelectedModel, setInternalSelectedModel] = useState(selectedModel || 'deepseek-v4-flash');

  // Sync internal model with prop
  useEffect(() => {
    if (selectedModel) {
      setInternalSelectedModel(selectedModel);
    }
  }, [selectedModel]);

  const activePlanMode = externalPlanMode !== undefined ? externalPlanMode : localPlanMode;

  const handlePlanModeChange = useCallback(
    (newMode: 'plan' | 'direct') => {
      setLocalPlanMode(newMode);
      if (onPlanModeChange) {
        onPlanModeChange(newMode);
      }
      if (onReasoningModeChange) {
        onReasoningModeChange(newMode === 'plan' ? 'DeepThink' : 'Quick');
      }
    },
    [onPlanModeChange, onReasoningModeChange]
  );

  // Slash commands query & filtering
  const slashQuery = useMemo(() => {
    if (value.startsWith('/')) {
      const match = value.match(/^\/([^\s]*)/);
      return match ? match[1] : value.slice(1);
    }
    return '';
  }, [value]);

  const filteredSlashCommands = useMemo(() => {
    return filterSlashCommands(slashQuery);
  }, [slashQuery]);

  // Automatically open slash menu when user types leading slash
  useEffect(() => {
    if (value.startsWith('/')) {
      setSlashMenuOpen(true);
    } else if (slashMenuOpen && !value.includes('/')) {
      setSlashMenuOpen(false);
    }
  }, [value, slashMenuOpen]);

  // Reset selectedIndex when filtered list changes
  useEffect(() => {
    setSlashSelectedIndex(0);
  }, [filteredSlashCommands.length, slashQuery]);

  // Model list
  const modelList = useMemo(() => {
    const allCatalogList: { id: string; name: string; provider: string; description: string; tag: string }[] = [];
    Object.entries(PROVIDER_MODEL_CATALOG).forEach(([provKey, models]) => {
      models.forEach((m) => {
        allCatalogList.push({
          id: m.value,
          name: (m as any).name || m.label,
          provider: provKey === 'deepseek' ? 'DeepSeek' : 'DB-GPT Local',
          description: m.description,
          tag: m.tag || provKey.toUpperCase(),
        });
      });
    });

    if (availableModels && availableModels.length > 0) {
      return availableModels.map((m) => {
        const foundCatalog = allCatalogList.find((c) => c.id === m || c.name === m);
        if (foundCatalog) return foundCatalog;
        const foundDefault = DEFAULT_MODELS.find((dm) => dm.id === m || dm.name === m);
        if (foundDefault) return foundDefault;
        return {
          id: m,
          name: m,
          provider: 'DeepSeek',
          description: 'Mô hình ngôn ngữ tối ưu cho phân tích dữ liệu',
          tag: 'DeepSeek',
        };
      });
    }
    return DEFAULT_MODELS;
  }, [availableModels]);

  // Active datasource resolution
  const activeDs = useMemo<DatasourceItem>(() => {
    if (initialDatasource && typeof initialDatasource === 'object') {
      return initialDatasource;
    }
    if (typeof initialDatasource === 'string') {
      const found = availableDatasources.find((d) => d.id === initialDatasource);
      if (found) return found;
    }
    if (selectedDatasourceId) {
      const found = availableDatasources.find((d) => d.id === selectedDatasourceId);
      if (found) return found;
    }
    return availableDatasources[0] || DEFAULT_DATASOURCES[0];
  }, [initialDatasource, selectedDatasourceId, availableDatasources]);

  // Filtered datasources based on search query
  const filteredDatasources = useMemo(() => {
    if (!searchQuery.trim()) return availableDatasources;
    const q = searchQuery.toLowerCase();
    return availableDatasources.filter(
      (ds) =>
        ds.name.toLowerCase().includes(q) ||
        ds.type.toLowerCase().includes(q) ||
        (ds.description && ds.description.toLowerCase().includes(q))
    );
  }, [availableDatasources, searchQuery]);

  // Auto-expansion of textarea between min-height 44px and max-height 180px
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const computedMin = 44;
    const scrollH = textarea.scrollHeight;
    const nextHeight = Math.min(Math.max(scrollH, computedMin), 180);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = scrollH > 180 ? 'auto' : 'hidden';
  }, [value, isCompact]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dsDropdownRef.current && !dsDropdownRef.current.contains(e.target as Node)) {
        setDsOpen(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
      if (slashDropdownRef.current && !slashDropdownRef.current.contains(e.target as Node)) {
        setSlashMenuOpen(false);
      }
    };
    if (dsOpen || modelOpen || slashMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dsOpen, modelOpen, slashMenuOpen]);

  const handleSelectDs = (ds: DatasourceItem) => {
    setDsOpen(false);
    setSearchQuery('');
    onSelectDatasource?.(ds);
  };

  const handleSelectModelItem = (modelId: string) => {
    setInternalSelectedModel(modelId);
    setModelOpen(false);
    onSelectModel?.(modelId);
  };

  const handleSelectSlashCommand = useCallback(
    (cmd: SlashCommandDefinition) => {
      setSlashMenuOpen(false);
      if (onSelectSlashCommand) {
        onSelectSlashCommand(cmd);
      } else {
        onChange(cmd.defaultPrompt);
      }
    },
    [onSelectSlashCommand, onChange]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setAttachedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;

    // Handle Slash Menu Navigation
    if (slashMenuOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex((prev) => (prev + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (!e.shiftKey) {
          e.preventDefault();
          const targetCmd = filteredSlashCommands[slashSelectedIndex] || filteredSlashCommands[0];
          if (targetCmd) {
            handleSelectSlashCommand(targetCmd);
          }
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        onStop?.();
      } else if (value.trim()) {
        onSend();
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isStreaming) {
      onStop?.();
    } else if (value.trim()) {
      onSend();
    }
  };

  const activeModelDisplay = useMemo(() => {
    const found = modelList.find((m) => m.id === internalSelectedModel || m.name === internalSelectedModel);
    return found ? found.name : (internalSelectedModel || 'DeepSeek V4 Flash');
  }, [modelList, internalSelectedModel]);

  const datasourceDisplayLabel = useMemo(() => {
    if (activeDs.name.includes('PostgreSQL')) return 'PostgreSQL · 14 bảng';
    if (activeDs.tablesCount) return `${activeDs.name} · ${activeDs.tablesCount} bảng`;
    return activeDs.name;
  }, [activeDs]);

  return (
    <div
      data-openwork-composer="true"
      className={cn('chat-input-wrapper relative w-full select-none', className)}
    >
      <form onSubmit={handleSubmit} className="w-full flex flex-col group/composer">
        {/* ── OpenWork Single-Line Capsule Container ── */}
        <div ref={containerRef} className="ow-composer-capsule relative flex flex-col justify-center rounded-[18px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] transition-all duration-200">
          
          {/* Slash Command Autocomplete Popover */}
          <OpenWorkSlashMenu
            isOpen={slashMenuOpen}
            commands={filteredSlashCommands}
            selectedIndex={slashSelectedIndex}
            onSelect={handleSelectSlashCommand}
            onClose={() => setSlashMenuOpen(false)}
            onHoverIndex={(idx) => setSlashSelectedIndex(idx)}
            query={slashQuery}
          />

          {/* Attached Files Strip */}
          {attachedFiles.length > 0 && (
            <div className="mb-2 p-1.5 flex items-center gap-1.5 flex-wrap border-b border-[var(--border)] bg-[var(--muted)]/40 rounded-t-[9px]">
              {attachedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--fg)] font-medium animate-in fade-in zoom-in-95 duration-100"
                >
                  <FileText size={12} className="text-[var(--muted-fg)] shrink-0" />
                  <span className="truncate max-w-40 font-mono text-[0.6875rem]">{file.name}</span>
                  <span className="text-[0.625rem] text-[var(--muted-fg)]">({Math.round(file.size / 1024)}KB)</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    aria-label={`Xóa file ${file.name}`}
                    className="p-0.5 hover:bg-[var(--muted)] rounded-full text-[var(--muted-fg)] hover:text-[var(--fg)] transition-colors cursor-pointer"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── 1. Textarea Row: Auto-expanding, full width of card ── */}
          <div className="w-full px-1 pt-1 pb-0.5 min-w-0">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isCompact ? 'Hỏi về dữ liệu, tạo báo cáo...' : placeholder}
              rows={1}
              disabled={disabled}
              aria-label="Khung soạn thảo câu lệnh và phân tích dữ liệu"
              className="ow-composer-textarea w-full p-0 bg-transparent leading-[1.6] text-[var(--fg)] placeholder:text-[var(--muted-fg)]/60 border-0 outline-none resize-none focus:outline-none custom-scrollbar font-sans min-h-[44px] max-h-[180px] caret-[#da7756] transition-colors block"
            />
          </div>

          {/* ── 2. Single-Line Toolbar Row: [Left Pills] [Right Controls] ── */}
          <div className="ow-composer-toolbar ow-composer-row flex items-center justify-between gap-1 w-full pt-1 min-w-0">
            {/* Left Group: Attach + Context Pills */}
            <div className="ow-toolbar-left flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-none">
              {/* 1. Attach Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Đính kèm tệp tin"
                aria-label="Đính kèm tệp tin"
                className="ow-pill-btn w-[28px] h-[28px] p-0 shrink-0 flex items-center justify-center border border-[var(--border)] bg-transparent text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-[7px] transition-colors cursor-pointer"
              >
                <Paperclip size={13} strokeWidth={1.8} />
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  multiple
                />
              </button>

              {/* 2. Model Selector Pill: 28px height, rounded-[7px] */}
              {showModelSelector && (
                <div className="relative flex items-center min-w-0 shrink-0" ref={modelDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setModelOpen((prev) => !prev)}
                    title={`Mô hình AI: ${activeModelDisplay} (OpenRouter)`}
                    aria-label={`Mô hình AI: ${activeModelDisplay} (OpenRouter)`}
                    className="ow-pill-btn h-[28px] px-[9px] min-w-0 flex items-center gap-1.5 border border-[var(--border)] bg-transparent hover:bg-[var(--muted)] text-[var(--fg2)] rounded-[7px] text-[0.71875rem] whitespace-nowrap font-medium font-sans transition-colors cursor-pointer"
                  >
                    <span className="ow-led-container">
                      <span className="ow-led-pulse" />
                      <span className="w-[5px] h-[5px] rounded-full bg-[var(--ok)] shrink-0 ow-led-core" />
                    </span>
                    <span className="font-medium whitespace-nowrap shrink-0">{activeModelDisplay}</span>
                    <ChevronDown size={10} className={`text-[var(--muted-fg)] shrink-0 transition-transform duration-150 ${modelOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Model Dropdown Popover */}
                  {modelOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-72 max-w-[calc(100vw-32px)] bg-[var(--card)] text-[var(--fg)] rounded-xl border border-[var(--border)] shadow-xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1">
                      <div className="px-2.5 py-1.5 text-xs font-semibold text-[var(--muted-fg)] uppercase tracking-wider flex items-center justify-between border-b border-[var(--hair)]">
                        <span>Mô Hình Ngôn Ngữ AI</span>
                      </div>

                      <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto custom-scrollbar pt-1">
                        {modelList.map((m) => {
                          const isSelected = m.id === internalSelectedModel || m.name === internalSelectedModel;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => handleSelectModelItem(m.id)}
                              aria-label={`Chọn mô hình: ${m.name}`}
                              className={cn(
                                'w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer',
                                isSelected
                                  ? 'bg-[var(--muted)] text-[var(--fg)] font-semibold shadow-xs'
                                  : 'hover:bg-[var(--muted)] text-[var(--muted-fg)] hover:text-[var(--fg)]'
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs truncate">{m.name}</span>
                                    {m.tag && (
                                       <span className="text-[0.625rem] px-1 py-px rounded bg-[var(--muted)] font-mono text-[var(--muted-fg)]">
                                         {m.tag}
                                       </span>
                                    )}
                                  </div>
                                  {m.description && (
                                    <p className="text-[0.6875rem] text-[var(--muted-fg)] truncate mt-0.5">{m.description}</p>
                                  )}
                                </div>
                              </div>
                              {isSelected && <Check size={14} className="text-[var(--primary)] shrink-0 ml-2" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Datasource Pill: 28px height, rounded-[7px], hidden when compact */}
              {!isCompact && (
                <div className="relative hidden md:flex items-center min-w-0 shrink-0" ref={dsDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setDsOpen((prev) => !prev)}
                    title={`Cơ sở dữ liệu: ${activeDs.name}`}
                    aria-label={`Cơ sở dữ liệu: ${activeDs.name}`}
                    className="ow-pill-btn h-[28px] px-[9px] min-w-0 flex items-center gap-1.5 border border-[var(--border)] bg-transparent hover:bg-[var(--muted)] text-[var(--fg2)] rounded-[7px] text-[0.71875rem] whitespace-nowrap font-medium font-sans transition-colors cursor-pointer"
                  >
                    <span className="ow-led-container">
                      <span className="ow-led-pulse" />
                      <span className="w-[5px] h-[5px] rounded-full bg-[var(--ok)] shrink-0 ow-led-core" />
                    </span>
                    <Database size={11} className="text-[var(--muted-fg)] shrink-0" />
                    <span className="truncate min-w-[28px] max-w-[70px] sm:max-w-[110px] font-medium">
                      {datasourceDisplayLabel}
                    </span>
                    <ChevronDown size={10} className={`text-[var(--muted-fg)] shrink-0 transition-transform duration-150 ${dsOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Datasource Dropdown Popover */}
                  {dsOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-80 max-w-[calc(100vw-32px)] bg-[var(--card)] text-[var(--fg)] rounded-xl border border-[var(--border)] shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1.5">
                      <div className="px-2 py-1 text-[0.6875rem] font-semibold text-[var(--muted-fg)] uppercase tracking-wider flex items-center justify-between border-b border-[var(--hair)]">
                        <span>Nguồn Dữ Liệu Doanh Nghiệp</span>
                        <span className="text-[0.625rem] font-mono text-[var(--ok)] bg-[var(--muted)] px-1.5 py-0.5 rounded-full font-normal">DB-GPT</span>
                      </div>

                      {/* Search Input */}
                      <div className="px-1">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--muted)] border border-[var(--border)] focus-within:border-[var(--accent)] transition-colors">
                          <Search size={13} className="text-[var(--muted-fg)] shrink-0" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Tìm kiếm database, bảng..."
                            aria-label="Tìm kiếm database, bảng"
                            className="w-full bg-transparent text-xs text-[var(--fg)] placeholder:text-[var(--muted-fg)]/60 focus:outline-none"
                            autoFocus
                          />
                        </div>
                      </div>

                      {/* Datasource List */}
                      <div className="flex flex-col gap-0.5 max-h-52 overflow-y-auto custom-scrollbar pt-1">
                        {filteredDatasources.length === 0 ? (
                          <div className="py-4 text-center text-xs text-[var(--muted-fg)]">
                            Không tìm thấy nguồn dữ liệu phù hợp
                          </div>
                        ) : (
                          filteredDatasources.map((ds) => {
                            const isSelected = ds.id === activeDs.id;
                            return (
                              <button
                                key={ds.id}
                                type="button"
                                onClick={() => handleSelectDs(ds)}
                                aria-label={`Chọn nguồn dữ liệu: ${ds.name}`}
                                className={cn(
                                  'w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer',
                                  isSelected
                                    ? 'bg-[var(--muted)] text-[var(--fg)] font-medium'
                                    : 'hover:bg-[var(--muted)] text-[var(--muted-fg)] hover:text-[var(--fg)]'
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs truncate font-medium">{ds.name}</span>
                                      <span className="text-[0.625rem] uppercase font-mono px-1 py-px rounded bg-[var(--muted)] text-[var(--muted-fg)]">
                                        {ds.type}
                                      </span>
                                    </div>
                                    {ds.description && (
                                      <p className="text-[0.6875rem] text-[var(--muted-fg)] truncate mt-0.5">{ds.description}</p>
                                    )}
                                    {typeof ds.tablesCount === 'number' && (
                                      <p className="text-[0.65625rem] text-[var(--ok)] font-medium">
                                        {ds.tablesCount} tables
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {isSelected && <Check size={14} className="text-[var(--primary)] shrink-0 ml-2" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Group: Mode Switcher & Circular Send Button */}
            <div className="ow-toolbar-right flex items-center gap-1.5 shrink-0 ml-auto pl-1">
              {/* Plan / Direct Mode Segmented Pill Slider: 22px height rounded-[6px] */}
              {!isCompact && (
                <div className="ow-mode-slider-track hidden sm:flex items-center gap-[2px] border border-[var(--border)] rounded-[8px] p-[2px] shrink-0">
                  <button
                    type="button"
                    onClick={() => handlePlanModeChange('plan')}
                    title="Chế độ Kế hoạch: AI lập kế hoạch suy luận trước khi trích xuất dữ liệu"
                    className={cn(
                      'ow-mode-slider-item h-[22px] px-[9px] rounded-[6px] text-[0.6875rem] whitespace-nowrap cursor-pointer border-0 relative z-10 transition-colors',
                      activePlanMode === 'plan'
                        ? 'is-active font-medium'
                        : 'bg-transparent text-[var(--muted-fg)] hover:text-[var(--fg)]'
                    )}
                  >
                    {activePlanMode === 'plan' && (
                      <motion.div
                        layoutId="activePlanModeIndicator"
                        className="ow-mode-slider-indicator absolute inset-0 rounded-[6px]"
                        transition={{ type: 'spring', stiffness: 480, damping: 34, mass: 0.8 }}
                      />
                    )}
                    <span className="relative z-20">Có kế hoạch</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePlanModeChange('direct')}
                    title="Chế độ Trực tiếp: Phân tích nhanh và trả lời ngay lập tức"
                    className={cn(
                      'ow-mode-slider-item h-[22px] px-[9px] rounded-[6px] text-[0.6875rem] whitespace-nowrap cursor-pointer border-0 relative z-10 transition-colors',
                      activePlanMode === 'direct'
                        ? 'is-active font-medium'
                        : 'bg-transparent text-[var(--muted-fg)] hover:text-[var(--fg)]'
                    )}
                  >
                    {activePlanMode === 'direct' && (
                      <motion.div
                        layoutId="activePlanModeIndicator"
                        className="ow-mode-slider-indicator absolute inset-0 rounded-[6px]"
                        transition={{ type: 'spring', stiffness: 480, damping: 34, mass: 0.8 }}
                      />
                    )}
                    <span className="relative z-20">Trả lời ngay</span>
                  </button>
                </div>
              )}

              {/* Send / Stop Button: 29x29px circular button */}
              <div className="flex items-center shrink-0">
                {isStreaming ? (
                  <motion.button
                    type="button"
                    onClick={onStop}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    aria-label="Dừng phản hồi"
                    title="Dừng (Stop generation)"
                    className="ow-btn-stop w-[29px] h-[29px] rounded-[8px] rounded-full bg-[var(--err)] hover:opacity-90 text-white flex items-center justify-center transition-all cursor-pointer shadow-2xs border-0 shrink-0"
                  >
                    <Square size={11} className="fill-current" />
                  </motion.button>
                ) : (
                  <motion.button
                    type="submit"
                    disabled={!value.trim()}
                    whileHover={value.trim() ? { scale: 1.05 } : undefined}
                    whileTap={value.trim() ? { scale: 0.95 } : undefined}
                    aria-label="Gửi tin nhắn (Enter)"
                    title="Gửi (Enter)"
                    className={cn(
                      'chat-input-submit ow-btn-send w-[29px] h-[29px] rounded-[8px] rounded-full flex items-center justify-center shrink-0 transition-all duration-150 border-0',
                      value.trim()
                        ? 'is-enabled bg-[var(--primary)] text-[var(--primary-fg)] cursor-pointer hover:opacity-90 shadow-sm'
                        : 'is-disabled bg-[var(--muted)] text-[var(--muted-fg)]/40 cursor-not-allowed'
                    )}
                  >
                    <ArrowUp size={15} strokeWidth={2.4} />
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Hint line below: fluid font, var(--muted-fg), left hint + right mono token meta ── */}
        <div className="hidden sm:flex items-center gap-2.5 pt-[7px] px-1 pb-0 text-[0.65625rem] text-[var(--muted-fg)] select-none opacity-0 group-focus-within/composer:opacity-100 group-hover/composer:opacity-100 transition-opacity duration-150">
          <span className="whitespace-nowrap">Enter để gửi · Shift+Enter xuống dòng</span>
          {tokenMeta && <span className="ml-auto font-mono text-[0.65625rem] text-[var(--muted-fg)]">{tokenMeta}</span>}
        </div>
      </form>
    </div>
  );
};

export default OpenWorkComposer;
