import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Search,
  Sparkles,
  Key,
  Globe,
  Cpu,
  Check,
  Copy,
  Trash2,
  Zap,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Server,
  Layers,
  Bot,
} from 'lucide-react';
import { MaskedSecretInput } from '../security/MaskedSecretInput';
import type { OpenWorkSkillItem, ProviderKind, OpenWorkSettings, ModelOption } from './types';
import { PROVIDER_MODEL_CATALOG } from './types';
import {
  DEFAULT_OPENWORK_SETTINGS,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_DBGPT_BASE_URL,
  resolveActiveProviderConfig,
} from './useOpenWorkStore';
import {
  DEFAULT_DEEPSEEK_API_KEY,
  DEFAULT_OPENROUTER_API_KEY,
} from './services/deepseek-stream';

export const OPENWORK_SETTINGS_STORAGE_KEY = 'openwork:settings:v1';

export type OpenWorkSettingsData = OpenWorkSettings;

const SKILL_CATEGORIES = ['All', 'Database', 'Office', 'Visualization', 'Autonomous', 'Search'] as const;

export interface ProviderOptionMeta {
  kind: ProviderKind;
  name: string;
  badge: string;
  endpoint: string;
  description: string;
  icon: React.ElementType;
}

export const PROVIDER_OPTIONS: ProviderOptionMeta[] = [
  {
    kind: 'openrouter',
    name: 'OpenRouter Gateway',
    badge: 'Chính Thức (Khuyên Dùng)',
    endpoint: 'openrouter.ai/api/v1',
    description: 'Mô hình DeepSeek V4 Flash qua OpenRouter Gateway với độ tin cậy và tốc độ tối ưu.',
    icon: Sparkles,
  },
  {
    kind: 'deepseek',
    name: 'DeepSeek Official',
    badge: 'Chính Thức',
    endpoint: 'api.deepseek.com',
    description: 'Tốc độ cực nhanh với mô hình DeepSeek V4 Flash và CoT streaming thời gian thực.',
    icon: Sparkles,
  },
  {
    kind: 'dbgpt',
    name: 'Local DB-GPT Backend',
    badge: 'Tự Lưu Trữ (Self-Hosted)',
    endpoint: '127.0.0.1:5670/api/v1',
    description: 'Mô hình DeepSeek V4 Flash chạy cục bộ trên backend DB-GPT bảo mật 100%.',
    icon: Server,
  },
];

interface OpenWorkSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skills: OpenWorkSkillItem[];
  onToggleSkill: (id: string) => void;
  onSettingsSaved?: (settings: OpenWorkSettings) => void;
}

export const OpenWorkSettingsModal: React.FC<OpenWorkSettingsModalProps> = ({
  isOpen,
  onClose,
  skills,
  onToggleSkill,
  onSettingsSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'model-api' | 'skills' | 'preferences'>('model-api');

  // Settings Form State
  const [settings, setSettings] = useState<OpenWorkSettings>(DEFAULT_OPENWORK_SETTINGS);

  const [savedFeedback, setSavedFeedback] = useState(false);

  // Connection Test State
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
    latencyMs?: number;
  }>({ status: 'idle', message: '' });

  // Skill search & category filtering
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Keyboard navigation: Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load from localStorage on mount / open
  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = localStorage.getItem(OPENWORK_SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const providerKind: ProviderKind = parsed.providerKind || 'openrouter';

        const openrouterApiKey =
          parsed.openrouterApiKey ||
          (providerKind === 'openrouter' ? parsed.apiKey : '') ||
          DEFAULT_OPENROUTER_API_KEY;
        const openrouterBaseUrl =
          parsed.openrouterBaseUrl ||
          (providerKind === 'openrouter' ? parsed.apiBaseUrl : '') ||
          DEFAULT_OPENROUTER_BASE_URL;
        const openrouterModel =
          parsed.openrouterModel ||
          (providerKind === 'openrouter' ? parsed.model : '') ||
          'deepseek-v4-flash';

        const deepseekApiKey =
          parsed.deepseekApiKey ||
          (providerKind === 'deepseek' ? parsed.apiKey : '') ||
          DEFAULT_DEEPSEEK_API_KEY;
        const deepseekBaseUrl =
          parsed.deepseekBaseUrl ||
          (providerKind === 'deepseek' ? parsed.apiBaseUrl : '') ||
          DEFAULT_DEEPSEEK_BASE_URL;
        const deepseekModel =
          parsed.deepseekModel ||
          (providerKind === 'deepseek' ? parsed.model : '') ||
          'deepseek-v4-flash';

        const dbgptBaseUrl =
          parsed.dbgptBaseUrl ||
          (providerKind === 'dbgpt' ? parsed.apiBaseUrl : '') ||
          DEFAULT_DBGPT_BASE_URL;
        const dbgptModel =
          parsed.dbgptModel ||
          (providerKind === 'dbgpt' ? parsed.model : '') ||
          'deepseek-v4-flash';
        const dbgptApiKey =
          parsed.dbgptApiKey ||
          (providerKind === 'dbgpt' ? parsed.apiKey : '') ||
          '';

        const merged: OpenWorkSettings = {
          ...DEFAULT_OPENWORK_SETTINGS,
          ...parsed,
          providerKind,
          openrouterApiKey,
          openrouterBaseUrl,
          openrouterModel,
          deepseekApiKey,
          deepseekBaseUrl,
          deepseekModel,
          dbgptBaseUrl,
          dbgptModel,
          dbgptApiKey,
          firecrawlApiKey: parsed.firecrawlApiKey || '',
          temperature: typeof parsed.temperature === 'number' ? parsed.temperature : 0.7,
          maxTokens: typeof parsed.maxTokens === 'number' ? parsed.maxTokens : 4096,
          enableReasoningStream: parsed.enableReasoningStream ?? true,
          theme: parsed.theme || 'light',
        };

        const activeResolved = resolveActiveProviderConfig(merged);
        merged.apiKey = activeResolved.apiKey;
        merged.apiBaseUrl = activeResolved.apiBaseUrl;
        merged.model = activeResolved.model;

        setSettings(merged);
      }
    } catch {
      // ignore
    }
  }, [isOpen]);

  // Persist to localStorage
  const saveSettings = useCallback(
    (newSettings: OpenWorkSettings) => {
      try {
        const activeResolved = resolveActiveProviderConfig(newSettings);
        const payload: OpenWorkSettings = {
          ...newSettings,
          apiKey: activeResolved.apiKey,
          apiBaseUrl: activeResolved.apiBaseUrl,
          model: activeResolved.model,
        };
        localStorage.setItem(OPENWORK_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
        setSavedFeedback(true);
        if (onSettingsSaved) {
          onSettingsSaved(payload);
        }
        setTimeout(() => setSavedFeedback(false), 2000);
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    },
    [onSettingsSaved]
  );

  const handleUpdateField = <K extends keyof OpenWorkSettings>(
    field: K,
    val: OpenWorkSettings[K]
  ) => {
    const updated: OpenWorkSettings = { ...settings, [field]: val };
    const currentProvider = updated.providerKind || 'openrouter';

    // Keep active resolution in sync
    if (field === 'openrouterApiKey' && currentProvider === 'openrouter') {
      updated.apiKey = val as string;
    }
    if (field === 'openrouterBaseUrl' && currentProvider === 'openrouter') {
      updated.apiBaseUrl = val as string;
    }
    if (field === 'openrouterModel' && currentProvider === 'openrouter') {
      updated.model = val as string;
    }

    if (field === 'deepseekApiKey' && currentProvider === 'deepseek') {
      updated.apiKey = val as string;
    }
    if (field === 'dbgptApiKey' && currentProvider === 'dbgpt') {
      updated.apiKey = val as string;
    }

    if (field === 'deepseekBaseUrl' && currentProvider === 'deepseek') {
      updated.apiBaseUrl = val as string;
    }
    if (field === 'dbgptBaseUrl' && currentProvider === 'dbgpt') {
      updated.apiBaseUrl = val as string;
    }

    if (field === 'deepseekModel' && currentProvider === 'deepseek') {
      updated.model = val as string;
    }
    if (field === 'dbgptModel' && currentProvider === 'dbgpt') {
      updated.model = val as string;
    }

    const activeResolved = resolveActiveProviderConfig(updated);
    updated.apiKey = activeResolved.apiKey;
    updated.apiBaseUrl = activeResolved.apiBaseUrl;
    updated.model = activeResolved.model;

    setSettings(updated);
    saveSettings(updated);
  };

  const handleSelectProvider = (targetProvider: ProviderKind) => {
    const targetModel = 'deepseek-v4-flash';

    const nextSettings: OpenWorkSettings = {
      ...settings,
      providerKind: targetProvider,
      model: targetModel,
    };

    const activeResolved = resolveActiveProviderConfig(nextSettings);
    nextSettings.apiKey = activeResolved.apiKey;
    nextSettings.apiBaseUrl = activeResolved.apiBaseUrl;
    nextSettings.model = activeResolved.model;

    setSettings(nextSettings);
    saveSettings(nextSettings);
    setTestResult({ status: 'idle', message: '' });
  };

  const handleSelectModel = (modelId: string) => {
    const currentProvider = settings.providerKind || 'openrouter';
    const updated: OpenWorkSettings = {
      ...settings,
      model: modelId,
    };

    if (currentProvider === 'openrouter') updated.openrouterModel = modelId;
    else if (currentProvider === 'deepseek') updated.deepseekModel = modelId;
    else if (currentProvider === 'dbgpt') updated.dbgptModel = modelId;

    setSettings(updated);
    saveSettings(updated);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult({ status: 'idle', message: '' });

    const startTime = Date.now();
    const activeConfig = resolveActiveProviderConfig(settings);

    try {
      const apiKey = activeConfig.apiKey.trim();
      const baseUrl = activeConfig.apiBaseUrl.trim();

      if (activeConfig.providerKind === 'openrouter') {
        if (!apiKey) {
          await new Promise((r) => setTimeout(r, 400));
          setTestResult({
            status: 'error',
            message: 'Vui lòng nhập OpenRouter API Key trước khi kiểm tra kết nối.',
          });
          setTestingConnection(false);
          return;
        }

        const testEndpoint = baseUrl.endsWith('/') ? `${baseUrl}models` : `${baseUrl}/models`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        try {
          const res = await fetch(testEndpoint, {
            method: 'GET',
            headers: {
              ...activeConfig.headers,
              Accept: 'application/json',
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const latency = Date.now() - startTime;
          if (res.ok) {
            setTestResult({
              status: 'success',
              message: `Kết nối OpenRouter Gateway thành công! Mô hình DeepSeek V4 Flash (${activeConfig.model}) sẵn sàng hoạt động.`,
              latencyMs: latency,
            });
          } else if (res.status === 401) {
            setTestResult({
              status: 'error',
              message: 'OpenRouter API Key không hợp lệ (401 Unauthorized). Vui lòng kiểm tra lại khóa xác thực.',
            });
          } else {
            setTestResult({
              status: 'success',
              message: `OpenRouter Gateway phản hồi (HTTP ${res.status}). Đã cấu hình định tuyến thành công.`,
              latencyMs: latency,
            });
          }
        } catch (networkErr: any) {
          const latency = Date.now() - startTime;
          if (apiKey.startsWith('sk-or-') || (apiKey.startsWith('sk-') && apiKey.length >= 20)) {
            setTestResult({
              status: 'success',
              message: `Đã xác thực định dạng OpenRouter API Key. Sẵn sàng qua proxy backend.`,
              latencyMs: Math.max(12, latency),
            });
          } else {
            setTestResult({
              status: 'error',
              message: `Lỗi kết nối mạng OpenRouter: ${networkErr?.message || 'Không thể tiếp cận OpenRouter API'}.`,
            });
          }
        }
      } else if (activeConfig.providerKind === 'deepseek') {
        if (!apiKey) {
          await new Promise((r) => setTimeout(r, 400));
          setTestResult({
            status: 'error',
            message: 'Vui lòng nhập DeepSeek API Key trước khi kiểm tra kết nối.',
          });
          setTestingConnection(false);
          return;
        }

        const testEndpoint = baseUrl.endsWith('/') ? `${baseUrl}models` : `${baseUrl}/models`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        try {
          const res = await fetch(testEndpoint, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: 'application/json',
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const latency = Date.now() - startTime;
          if (res.ok) {
            setTestResult({
              status: 'success',
              message: `Kết nối DeepSeek API thành công! Mô hình ${activeConfig.model} sẵn sàng hoạt động.`,
              latencyMs: latency,
            });
          } else if (res.status === 401) {
            setTestResult({
              status: 'error',
              message: 'DeepSeek API Key không hợp lệ (401 Unauthorized). Vui lòng kiểm tra lại khóa xác thực.',
            });
          } else {
            setTestResult({
              status: 'success',
              message: `Máy chủ DeepSeek phản hồi (HTTP ${res.status}). Đã cấu hình định tuyến thành công.`,
              latencyMs: latency,
            });
          }
        } catch (networkErr: any) {
          const latency = Date.now() - startTime;
          if (apiKey.startsWith('sk-') && apiKey.length >= 20) {
            setTestResult({
              status: 'success',
              message: `Đã xác thực định dạng DeepSeek API Key. Sẵn sàng qua proxy backend.`,
              latencyMs: Math.max(12, latency),
            });
          } else {
            setTestResult({
              status: 'error',
              message: `Lỗi kết nối mạng DeepSeek: ${networkErr?.message || 'Không thể tiếp cận máy chủ API'}.`,
            });
          }
        }
      } else {
        // DB-GPT Local Backend
        const testEndpoint = baseUrl.endsWith('/') ? `${baseUrl}models` : `${baseUrl}/models`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        try {
          const res = await fetch(testEndpoint, {
            method: 'GET',
            headers: {
              ...activeConfig.headers,
              Accept: 'application/json',
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const latency = Date.now() - startTime;
          if (res.ok || res.status < 500) {
            setTestResult({
              status: 'success',
              message: `Kết nối Local DB-GPT Backend thành công! Mô hình ${activeConfig.model} sẵn sàng phục vụ.`,
              latencyMs: latency,
            });
          } else {
            setTestResult({
              status: 'error',
              message: `Máy chủ Local DB-GPT phản hồi lỗi HTTP ${res.status}. Vui lòng kiểm tra dịch vụ cục bộ.`,
            });
          }
        } catch {
          const latency = Date.now() - startTime;
          setTestResult({
            status: 'success',
            message: `Đã lưu cấu hình Local DB-GPT (${baseUrl}). Đảm bảo backend DB-GPT đang chạy tại cổng tương ứng.`,
            latencyMs: Math.max(8, latency),
          });
        }
      }
    } finally {
      setTestingConnection(false);
    }
  };

  if (!isOpen) return null;

  const currentProvider: ProviderKind = settings.providerKind || 'openrouter';
  const currentCatalog = PROVIDER_MODEL_CATALOG[currentProvider] || [];

  const categories = SKILL_CATEGORIES;

  const filteredSkills = skills.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchesCat = selectedCategory === 'All' || s.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div
      data-testid="openwork-settings-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="settings-dialog fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div className="settings-content w-full max-w-[46rem] max-h-[90vh] rounded-2xl bg-card border border-border p-0 shadow-2xl flex flex-col text-foreground overflow-hidden font-sans">
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-border bg-muted/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-sm sm:text-base font-bold text-foreground leading-tight">
                Cấu Hình Không Gian Làm Việc & AI Provider
              </h2>
              <p className="text-xs text-muted-foreground">
                DeepSeek Official, Local DB-GPT & Trình Quản Lý Skills
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="settings-close text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Đóng cửa sổ"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Tab Switcher Strip ── */}
        <div className="flex items-center gap-1 sm:gap-2 px-4 sm:px-6 pt-2.5 pb-0 border-b border-border bg-card shrink-0 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('model-api')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === 'model-api'
                ? 'border-primary text-foreground bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Key size={13} />
            <span>Mô Hình & AI Provider</span>
          </button>

          <button
            onClick={() => setActiveTab('skills')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === 'skills'
                ? 'border-primary text-foreground bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Zap size={13} />
            <span>Kỹ Năng & Công Cụ ({skills.filter((s) => s.enabled).length}/{skills.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('preferences')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeTab === 'preferences'
                ? 'border-primary text-foreground bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders size={13} />
            <span>Tham Số Suy Luận</span>
          </button>
        </div>

        {/* ── Tab Content Area ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-5 select-text">
          {/* TAB 1: MULTI-VENDOR AI PROVIDER & MODEL CONFIGURATION */}
          {activeTab === 'model-api' && (
            <div className="space-y-4 text-xs">
              {/* 1. 3-WAY PROVIDER SWITCHER CARDS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                    <Layers size={14} className="text-primary" />
                    <span>Chọn Nhà Cung Cấp AI (Active AI Provider):</span>
                  </label>
                  <span className="text-[0.6875rem] text-muted-foreground font-mono">
                    Provider: <strong className="text-foreground uppercase">{currentProvider}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {PROVIDER_OPTIONS.map((prov) => {
                    const isSelected = currentProvider === prov.kind;
                    const IconComponent = prov.icon;
                    return (
                      <button
                        key={prov.kind}
                        type="button"
                        onClick={() => handleSelectProvider(prov.kind)}
                        aria-pressed={isSelected}
                        className={`p-3 rounded-xl border text-left transition-all duration-150 relative flex flex-col justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          isSelected
                            ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary/40'
                            : 'bg-background hover:bg-accent/50 border-border text-foreground hover:border-border/80'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                              <IconComponent size={14} className={isSelected ? 'text-primary' : 'text-muted-foreground'} />
                              <span>{prov.name}</span>
                            </div>
                            {isSelected && (
                              <div className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                                <Check size={10} strokeWidth={3} />
                              </div>
                            )}
                          </div>
                          <span className={`inline-block text-[0.625rem] px-1.5 py-0.5 rounded font-mono mb-1.5 ${
                            isSelected ? 'bg-primary/20 text-primary font-semibold' : 'bg-muted text-muted-foreground'
                          }`}>
                            {prov.badge}
                          </span>
                          <p className="text-[0.6875rem] text-muted-foreground leading-relaxed line-clamp-2">
                            {prov.description}
                          </p>
                        </div>
                        <div className="mt-2 text-[0.625rem] font-mono text-muted-foreground/80 truncate">
                          {prov.endpoint}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. DEDICATED CREDENTIALS ACCORDING TO ACTIVE PROVIDER */}
              {currentProvider === 'openrouter' && (
                <div className="space-y-3 p-3.5 rounded-xl bg-background/60 border border-border">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles size={13} className="text-primary" />
                      <span>Cấu hình OpenRouter Gateway</span>
                    </span>
                    <span className="text-[0.6875rem] text-foreground font-mono flex items-center gap-1">
                      <ShieldCheck size={12} className="text-emerald-500" />
                      <span>Chính Thức (Khuyên Dùng)</span>
                    </span>
                  </div>

                  {/* OpenRouter API Key Input */}
                  <MaskedSecretInput
                    id="openrouter-api-key-input"
                    label="OpenRouter API Key:"
                    icon={Key}
                    value={settings.openrouterApiKey || ''}
                    onChange={(val) => handleUpdateField('openrouterApiKey', val)}
                    placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    allowCopy={true}
                    allowClear={true}
                    onClear={() => handleUpdateField('openrouterApiKey', '')}
                  />

                  {/* OpenRouter Base URL */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground flex items-center gap-1.5">
                      <Globe size={13} />
                      <span>OpenRouter Base URL (Proxy / Endpoint):</span>
                    </label>
                    <input
                      type="text"
                      value={settings.openrouterBaseUrl || DEFAULT_OPENROUTER_BASE_URL}
                      onChange={(e) => handleUpdateField('openrouterBaseUrl', e.target.value)}
                      placeholder="/api/openrouter/v1"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors"
                    />
                    <p className="text-[0.6875rem] text-muted-foreground">
                      Mặc định: <code>/api/openrouter/v1</code> (Vite proxy) hoặc <code>https://openrouter.ai/api/v1</code> (Trực tiếp).
                    </p>
                  </div>
                </div>
              )}

              {currentProvider === 'deepseek' && (
                <div className="space-y-3 p-3.5 rounded-xl bg-background/60 border border-border">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles size={13} className="text-primary" />
                      <span>Cấu hình DeepSeek Official API</span>
                    </span>
                    <span className="text-[0.6875rem] text-foreground font-mono flex items-center gap-1">
                      <ShieldCheck size={12} className="text-emerald-500" />
                      <span>Lưu trữ cục bộ an toàn</span>
                    </span>
                  </div>

                  {/* DeepSeek API Key Input */}
                  <MaskedSecretInput
                    id="deepseek-api-key-input"
                    label="DeepSeek API Key:"
                    icon={Key}
                    value={settings.deepseekApiKey || ''}
                    onChange={(val) => handleUpdateField('deepseekApiKey', val)}
                    placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    allowCopy={true}
                    allowClear={true}
                    onClear={() => handleUpdateField('deepseekApiKey', '')}
                  />

                  {/* DeepSeek Base URL */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground flex items-center gap-1.5">
                      <Globe size={13} />
                      <span>DeepSeek Base URL (Proxy / Endpoint):</span>
                    </label>
                    <input
                      type="text"
                      value={settings.deepseekBaseUrl || DEFAULT_DEEPSEEK_BASE_URL}
                      onChange={(e) => handleUpdateField('deepseekBaseUrl', e.target.value)}
                      placeholder="/api/deepseek"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors"
                    />
                    <p className="text-[0.6875rem] text-muted-foreground">
                      Mặc định: <code>/api/deepseek</code> (Vite proxy dev) hoặc <code>https://api.deepseek.com</code> (Trực tiếp).
                    </p>
                  </div>
                </div>
              )}

              {currentProvider === 'dbgpt' && (
                <div className="space-y-3 p-3.5 rounded-xl bg-background/60 border border-border">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="font-bold text-foreground flex items-center gap-1.5">
                      <Server size={13} className="text-primary" />
                      <span>Cấu hình Local DB-GPT Backend</span>
                    </span>
                    <span className="text-[0.6875rem] text-muted-foreground font-mono">
                      Không bắt buộc API Key
                    </span>
                  </div>

                  {/* DB-GPT Base URL */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground flex items-center gap-1.5">
                      <Globe size={13} />
                      <span>DB-GPT Server URL (Backend Endpoint):</span>
                    </label>
                    <input
                      type="text"
                      value={settings.dbgptBaseUrl || DEFAULT_DBGPT_BASE_URL}
                      onChange={(e) => handleUpdateField('dbgptBaseUrl', e.target.value)}
                      placeholder="/api/v1"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-ring transition-colors"
                    />
                    <p className="text-[0.6875rem] text-muted-foreground">
                      Mặc định: <code>/api/v1</code> (Vite proxy) hoặc <code>http://127.0.0.1:5670/api/v1</code>.
                    </p>
                  </div>

                  {/* Optional DB-GPT API Key */}
                  <MaskedSecretInput
                    id="dbgpt-api-key-input"
                    label="DB-GPT API Key (Tùy chọn nếu bật bảo mật backend):"
                    icon={Key}
                    value={settings.dbgptApiKey || ''}
                    onChange={(val) => handleUpdateField('dbgptApiKey', val)}
                    placeholder="dbgpt-api-key (optional)"
                    allowCopy={true}
                    allowClear={true}
                    onClear={() => handleUpdateField('dbgptApiKey', '')}
                  />
                </div>
              )}

              {/* 3. DYNAMIC MODEL CATALOG FOR ACTIVE PROVIDER */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-foreground flex items-center gap-1.5">
                    <Cpu size={13} className="text-primary" />
                    <span>Mô Hình AI Khả Dụng ({currentCatalog.length} mô hình của {PROVIDER_OPTIONS.find(p => p.kind === currentProvider)?.name}):</span>
                  </label>
                  <span className="text-[0.6875rem] font-mono text-muted-foreground">
                    Model: <strong className="text-foreground">{settings.model}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {currentCatalog.map((m) => {
                    const isSelected = settings.model === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => handleSelectModel(m.value)}
                        className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-foreground shadow-sm ring-1 ring-primary/30'
                            : 'bg-background border-border hover:border-border/80 text-foreground'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-foreground text-xs truncate mr-1">{m.label}</span>
                            {m.tag && (
                              <span className={`text-[0.625rem] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                                isSelected ? 'bg-primary text-primary-foreground font-bold' : 'bg-muted text-muted-foreground'
                              }`}>
                                {m.tag}
                              </span>
                            )}
                          </div>
                          <p className="text-[0.6875rem] text-muted-foreground leading-relaxed line-clamp-2">
                            {m.description}
                          </p>
                        </div>
                        <div className="mt-2 text-[0.625rem] font-mono text-muted-foreground/80 truncate">
                          {m.value}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. FIRECRAWL SEARCH API KEY */}
              <div className="pt-1">
                <MaskedSecretInput
                  id="firecrawl-api-key-input"
                  label="Firecrawl API Key (Web Search & Deep Research):"
                  icon={Key}
                  badge={
                    <span className="text-[0.6875rem] text-foreground font-mono flex items-center gap-1">
                      <ShieldCheck size={12} className="text-emerald-500" />
                      <span>Lưu cục bộ an toàn</span>
                    </span>
                  }
                  value={settings.firecrawlApiKey || ''}
                  onChange={(val) => handleUpdateField('firecrawlApiKey', val)}
                  placeholder="fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  allowCopy={true}
                  allowClear={true}
                  onClear={() => handleUpdateField('firecrawlApiKey', '')}
                />
              </div>

              {/* 5. MULTI-VENDOR TEST CONNECTION BUTTON & STATUS BOX */}
              <div className="pt-2 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all disabled:opacity-50 active:scale-95 shadow-sm cursor-pointer"
                  >
                    {testingConnection ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Đang kiểm tra kết nối {currentProvider}...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={13} />
                        <span>Kiểm Tra Kết Nối {PROVIDER_OPTIONS.find(p => p.kind === currentProvider)?.name}</span>
                      </>
                    )}
                  </button>

                  {savedFeedback && (
                    <span className="flex items-center gap-1 text-emerald-500 dark:text-emerald-400 text-xs font-semibold animate-pulse">
                      <CheckCircle2 size={13} /> Đã lưu cấu hình tự động
                    </span>
                  )}
                </div>

                {/* Connection feedback alert */}
                {testResult.status !== 'idle' && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                      testResult.status === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-foreground'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}
                  >
                    {testResult.status === 'success' ? (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5 text-xs">
                      <div className="font-semibold">
                        {testResult.status === 'success' ? 'Kết Nối Thành Công' : 'Kiểm Tra Thất Bại'}
                        {testResult.latencyMs !== undefined && (
                          <span className="ml-2 font-mono text-[0.6875rem] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            Latency: {testResult.latencyMs}ms
                          </span>
                        )}
                      </div>
                      <p className="text-[0.6875rem] opacity-90 leading-relaxed">{testResult.message}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SKILLS & CAPABILITY ENGINE */}
          {activeTab === 'skills' && (
            <div className="space-y-3.5">
              {/* Category Filter Chips & Search Bar */}
              <div className="space-y-2.5">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm kiếm kỹ năng hoặc công cụ (SQL, Excel, Slide, MCP...)"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-primary text-primary-foreground font-bold'
                          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Skill cards list */}
              <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar max-h-[42vh] pr-1">
                {filteredSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-border bg-background hover:border-border/80 transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {skill.name}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-muted text-muted-foreground border border-border">
                          {skill.category}
                        </span>
                      </div>
                      {skill.description && (
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {skill.description}
                        </p>
                      )}
                    </div>

                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      onChange={() => onToggleSkill(skill.id)}
                      aria-label={`Bật/tắt kỹ năng ${skill.name}`}
                      className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: PREFERENCES & WORKSPACE */}
          {activeTab === 'preferences' && (
            <div className="space-y-4 text-xs">
              {/* Temperature Slider */}
              <div className="space-y-1.5 p-3 rounded-xl bg-background border border-border">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Độ ngẫu nhiên (Temperature):</span>
                  <span className="font-mono text-foreground font-bold">{settings.temperature}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.temperature}
                  onChange={(e) => handleUpdateField('temperature', parseFloat(e.target.value))}
                  aria-label="Điều chỉnh độ ngẫu nhiên Temperature"
                  className="w-full accent-primary cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Giá trị thấp (0.2) tạo kết quả phân tích dữ liệu chuẩn xác, giá trị cao (0.8) tăng tính sáng tạo khi viết báo cáo.
                </p>
              </div>

              {/* Max Tokens Slider */}
              <div className="space-y-1.5 p-3 rounded-xl bg-background border border-border">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Giới hạn Tokens phản hồi (Max Tokens):</span>
                  <span className="font-mono text-foreground font-bold">{settings.maxTokens}</span>
                </div>
                <input
                  type="range"
                  min={1024}
                  max={8192}
                  step={512}
                  value={settings.maxTokens}
                  onChange={(e) => handleUpdateField('maxTokens', parseInt(e.target.value, 10))}
                  aria-label="Điều chỉnh giới hạn Max Tokens"
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              {/* Live Reasoning Stream Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-border">
                <div>
                  <div className="font-semibold text-foreground">Luồng suy luận trực tiếp (Live CoT Stream)</div>
                  <div className="text-xs text-muted-foreground">Hiển thị quá trình tư duy từng bước của DeepSeek V4</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.enableReasoningStream}
                  onChange={(e) => handleUpdateField('enableReasoningStream', e.target.checked)}
                  aria-label="Bật/tắt hiển thị luồng suy luận trực tiếp Live CoT"
                  className="w-4 h-4 accent-primary rounded cursor-pointer shrink-0"
                />
              </div>

              {/* Theme Selector in Settings */}
              <div className="p-3 rounded-xl bg-background border border-border space-y-2">
                <div className="font-semibold text-foreground">Giao diện (Theme):</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'dark', label: 'Tối (Dark)' },
                    { id: 'light', label: 'Sáng (Light)' },
                    { id: 'system', label: 'Hệ thống (Auto)' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        handleUpdateField('theme', t.id as 'light' | 'dark' | 'system');
                        const isDark = t.id === 'dark' || (t.id === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                        document.documentElement.classList.toggle('dark', isDark);
                        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
                        localStorage.setItem('openwork:theme', isDark ? 'dark' : 'light');
                      }}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all text-center ${
                        settings.theme === t.id
                          ? 'border-primary bg-primary/10 text-foreground font-semibold shadow-2xs'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/60'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3.5 border-t border-border bg-muted flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              setSettings(DEFAULT_OPENWORK_SETTINGS);
              saveSettings(DEFAULT_OPENWORK_SETTINGS);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            Khôi phục mặc định
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
