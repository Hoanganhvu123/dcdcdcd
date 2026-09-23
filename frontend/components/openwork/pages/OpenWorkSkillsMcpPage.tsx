import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Server,
  Wrench,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Code2,
  Sparkles,
  Terminal,
  Copy,
  Check,
  Database,
  FileText,
  BarChart3,
  Cpu,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface OpenWorkSkillsMcpPageProps {
  onOpenAdd?: () => void;
}

export type SkillCategory = 'Database' | 'Office' | 'Visualization' | 'Autonomous' | 'Search & Audit';

export const SKILL_CATEGORIES: { key: SkillCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'Database', label: 'Database' },
  { key: 'Office', label: 'Office' },
  { key: 'Visualization', label: 'Visualization' },
  { key: 'Autonomous', label: 'Autonomous' },
  { key: 'Search & Audit', label: 'Search & Audit' },
];

interface SkillCardItem {
  id: string;
  name: string;
  tag: string;
  tone: string;
  category: SkillCategory;
  enabled: boolean;
  desc: string;
  calls: string;
  version: string;
}

interface McpServerItem {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'slow' | 'disconnected';
  latency: string;
  tools: string[];
  configJson: string;
}

const INITIAL_SKILLS: SkillCardItem[] = [
  {
    id: 'sql-analyst',
    name: 'SQL Data Analyst',
    tag: 'SQL',
    tone: 'var(--c2)',
    category: 'Database',
    enabled: true,
    desc: 'Tự động tạo câu truy vấn SQL chuẩn hóa, giải thích kế hoạch thực thi (EXPLAIN) và cảnh báo full-scan.',
    calls: '48.2k lượt gọi',
    version: 'v2.4.1',
  },
  {
    id: 'python-sandbox',
    name: 'Python Data Scientist',
    tag: 'PY',
    tone: 'var(--c3)',
    category: 'Autonomous',
    enabled: true,
    desc: 'Chạy phân tích số liệu trong sandbox Python cô lập với pandas, numpy, scipy và statsmodels.',
    calls: '19.4k lượt gọi',
    version: 'v3.1.0',
  },
  {
    id: 'sheet-studio',
    name: 'Spreadsheet Studio',
    tag: 'XLS',
    tone: 'var(--c3)',
    category: 'Office',
    enabled: true,
    desc: 'Trích xuất và biên tập bảng tính XLSX nhiều sheet, hỗ trợ công thức tài chính động và bảng tổng hợp Pivot.',
    calls: '31.8k lượt gọi',
    version: 'v2.0.8',
  },
  {
    id: 'deck-builder',
    name: 'Presentation Studio (16:9)',
    tag: 'PPT',
    tone: 'var(--c1)',
    category: 'Office',
    enabled: true,
    desc: 'Thiết kế slide báo cáo điều hành tỉ lệ 16:9 với 14 bố cục trực quan, biểu đồ mini và thẻ thống kê.',
    calls: '14.1k lượt gọi',
    version: 'v1.9.4',
  },
  {
    id: 'doc-writer',
    name: 'Executive Doc Writer',
    tag: 'DOC',
    tone: 'var(--c4)',
    category: 'Office',
    enabled: true,
    desc: 'Soạn thảo biên bản phân tích, báo cáo quản trị và tài liệu thẩm định theo chuẩn Word A4 trang trọng.',
    calls: '9.6k lượt gọi',
    version: 'v1.5.2',
  },
  {
    id: 'web-research',
    name: 'Web Deep Research',
    tag: 'WEB',
    tone: 'var(--c2)',
    category: 'Search & Audit',
    enabled: false,
    desc: 'Thu thập thông tin đa nguồn trên internet, trích xuất dữ liệu thị trường và đối thủ cạnh tranh.',
    calls: '22.7k lượt gọi',
    version: 'v2.8.0',
  },
  {
    id: 'trace-auditor',
    name: 'Log & Trace Auditor',
    tag: 'LOG',
    tone: 'var(--c5)',
    category: 'Search & Audit',
    enabled: true,
    desc: 'Kiểm toán câu lệnh truy vấn, phát hiện bất thường bảo mật dữ liệu và ghi vết hành động người dùng.',
    calls: '6.1k lượt gọi',
    version: 'v1.2.0',
  },
  {
    id: 'email-dispatcher',
    name: 'Email & Dispatcher',
    tag: 'MAIL',
    tone: 'var(--accent)',
    category: 'Autonomous',
    enabled: false,
    desc: 'Gửi báo cáo định kỳ tự động qua SMTP công ty, thông báo số liệu đột biến qua webhook.',
    calls: '3.4k lượt gọi',
    version: 'v1.0.6',
  },
  {
    id: 'chart-generator',
    name: 'Visual Chart Generator',
    tag: 'CHT',
    tone: 'var(--c1)',
    category: 'Visualization',
    enabled: true,
    desc: 'Tạo đồ thị SVG vector cao cấp: Donut, Area Trajectory, Funnel, Matrix Heatmap và Scatter Plot.',
    calls: '41.2k lượt gọi',
    version: 'v3.0.1',
  },
];

const INITIAL_MCP_SERVERS: McpServerItem[] = [
  {
    id: 'mcp-docker',
    name: 'Local Docker Sandbox',
    url: 'stdio://docker-openwork-sandbox:8000',
    status: 'connected',
    latency: '12 ms',
    tools: ['exec_sql', 'schema_inspect', 'export_parquet', 'sandbox_eval', 'py_run', 'file_stat', 'csv_parse', 'hash_sha256'],
    configJson: JSON.stringify(
      {
        mcpServers: {
          'docker-sandbox': {
            command: 'docker',
            args: ['run', '-i', '--rm', 'openwork-sandbox:latest'],
            env: {
              SANDBOX_TIMEOUT: '30s',
              MAX_MEMORY_MB: '2048',
            },
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: 'mcp-github',
    name: 'GitHub Enterprise Bridge',
    url: 'https://mcp-git.congty.vn/v1/mcp',
    status: 'connected',
    latency: '48 ms',
    tools: ['git_diff_compare', 'create_pull_request', 'list_repos', 'read_blob', 'commit_file', 'issue_search', 'branch_protect'],
    configJson: JSON.stringify(
      {
        mcpServers: {
          'github-bridge': {
            transport: 'sse',
            url: 'https://mcp-git.congty.vn/v1/mcp',
            headers: {
              Authorization: 'Bearer env:GITHUB_ENTERPRISE_TOKEN',
            },
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: 'mcp-jira',
    name: 'Jira & Confluence Sync',
    url: 'https://mcp-atlassian.congty.vn/sse',
    status: 'slow',
    latency: '142 ms',
    tools: ['fetch_jira_sprint', 'update_ticket', 'read_confluence_page', 'create_memo', 'assign_epic', 'export_pdf'],
    configJson: JSON.stringify(
      {
        mcpServers: {
          'jira-confluence': {
            transport: 'sse',
            url: 'https://mcp-atlassian.congty.vn/sse',
            options: {
              timeout: 15000,
              syncInterval: '5m',
            },
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: 'mcp-sap',
    name: 'SAP ERP Tool Connector',
    url: 'https://mcp-sap.congty.vn/mcp',
    status: 'disconnected',
    latency: '—',
    tools: [],
    configJson: JSON.stringify(
      {
        mcpServers: {
          'sap-erp': {
            transport: 'streamable-http',
            url: 'https://mcp-sap.congty.vn/mcp',
            status: 'offline_pending_gateway',
          },
        },
      },
      null,
      2
    ),
  },
];

const SAMPLE_SKILL_SCHEMA = `{
  "name": "credit_risk_eval",
  "description": "Thẩm định điểm rủi ro tín dụng khách hàng doanh nghiệp",
  "parameters": {
    "type": "object",
    "properties": {
      "customer_id": { "type": "string", "description": "Mã khách hàng CUST-xxx" },
      "debt_to_equity": { "type": "number", "description": "Tỷ lệ Nợ/Vốn chủ sở hữu" },
      "current_ratio": { "type": "number", "description": "Hệ số thanh toán hiện hành" }
    },
    "required": ["customer_id", "debt_to_equity"]
  }
}`;

export const OpenWorkSkillsMcpPage: React.FC<OpenWorkSkillsMcpPageProps> = ({
  onOpenAdd,
}) => {
  const [activeTab, setActiveTab] = useState<'skills' | 'mcp'>('skills');
  const [selectedCategory, setSelectedCategory] = useState<SkillCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [skills, setSkills] = useState<SkillCardItem[]>(INITIAL_SKILLS);
  const [mcpServers] = useState<McpServerItem[]>(INITIAL_MCP_SERVERS);
  const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({
    'mcp-docker': true,
  });
  const [expandedConfigs, setExpandedConfigs] = useState<Record<string, boolean>>({
    'mcp-docker': true,
  });
  const [copiedConfigId, setCopiedConfigId] = useState<string | null>(null);

  // Add Skill Form Modal / Collapse State
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [formName, setFormName] = useState<string>('Phân tích rủi ro tín dụng');
  const [formId, setFormId] = useState<string>('credit-risk-eval');
  const [formCategory, setFormCategory] = useState<SkillCategory>('Autonomous');
  const [formSchema, setFormSchema] = useState<string>(SAMPLE_SKILL_SCHEMA);

  const toggleSkill = (id: string) => {
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const toggleServerExpand = (id: string) => {
    setExpandedServers((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleConfigExpand = (id: string) => {
    setExpandedConfigs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyConfig = (id: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedConfigId(id);
      setTimeout(() => {
        setCopiedConfigId((prev) => (prev === id ? null : prev));
      }, 1600);
    }
  };

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCategory =
        selectedCategory === 'all' || s.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [skills, searchQuery, selectedCategory]);

  const filteredServers = useMemo(() => {
    return mcpServers.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.url.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [mcpServers, searchQuery]);

  const handleSaveSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formId.trim()) return;
    const newSkill: SkillCardItem = {
      id: formId.trim(),
      name: formName.trim(),
      tag: 'CST',
      tone: 'var(--c2)',
      category: formCategory,
      enabled: true,
      desc: 'Kỹ năng tùy chỉnh mới được đăng ký.',
      calls: '0 lượt gọi',
      version: 'v1.0.0',
    };
    setSkills((prev) => [newSkill, ...prev]);
    setShowAddForm(false);
    setFormName('');
    setFormId('');
  };

  const CANONICAL_CATEGORIES: SkillCategory[] = [
    'Database',
    'Office',
    'Visualization',
    'Autonomous',
    'Search & Audit',
  ];

  const renderSkillCard = (s: SkillCardItem) => (
    <div
      key={s.id}
      className={cn(
        'border rounded-xl p-3.5 bg-[var(--card)] shadow-[var(--shadow)] flex flex-col justify-between hover:-translate-y-1 hover:shadow-md transition-all duration-200',
        s.enabled ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-60'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{ color: s.tone }}
            className="w-6 h-6 rounded-md border border-[var(--border)] flex items-center justify-center font-mono text-[0.59375rem] font-semibold shrink-0 bg-[var(--bg)]"
          >
            {s.tag}
          </span>
          <div className="min-w-0">
            <div className="text-[0.78125rem] font-medium text-[var(--fg)] truncate">
              {s.name}
            </div>
            <div className="font-mono text-[0.65625rem] text-[var(--muted-fg)] truncate flex items-center gap-1.5">
              <span>{s.id}</span>
              <span className="text-[0.5625rem] px-1 py-0.2 rounded bg-[var(--muted)] border border-[var(--border)]/40 text-[var(--muted-fg)]">
                {s.category}
              </span>
            </div>
          </div>
        </div>

        {/* Smooth Spring Toggle Switch */}
        <button
          type="button"
          role="switch"
          aria-checked={s.enabled}
          onClick={() => toggleSkill(s.id)}
          className={cn(
            'relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
            s.enabled ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
          )}
        >
          <motion.span
            animate={{ x: s.enabled ? 14 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-[var(--primary-fg)] shadow-xs"
          />
        </button>
      </div>

      <p className="text-[0.71875rem] text-[var(--muted-fg)] mt-2.5 line-clamp-2 leading-relaxed">
        {s.desc}
      </p>

      <div className="flex items-center justify-between border-t border-[var(--hair)] pt-2.5 mt-3 text-[0.65625rem] text-[var(--muted-fg)]">
        <span className="font-mono">{s.calls}</span>
        <span className="font-mono">{s.version}</span>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px, Sticky with Backdrop Blur) ── */}
      <header className="sticky top-0 z-10 h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)]/60 bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            Skill & MCP
          </span>

          {/* Tab Switcher */}
          <div className="flex items-center gap-0.5 border border-[var(--border)] rounded-lg p-0.5 bg-[var(--card)]">
            <button
              type="button"
              onClick={() => setActiveTab('skills')}
              className={cn(
                'h-5.5 px-2.5 rounded-md text-[0.71875rem] transition-colors whitespace-nowrap cursor-pointer',
                activeTab === 'skills'
                  ? 'bg-[var(--primary)] text-[var(--primary-fg)] font-medium shadow-xs'
                  : 'text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)]'
              )}
            >
              Skill ({skills.filter((s) => s.enabled).length}/{skills.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mcp')}
              className={cn(
                'h-5.5 px-2.5 rounded-md text-[0.71875rem] transition-colors whitespace-nowrap cursor-pointer',
                activeTab === 'mcp'
                  ? 'bg-[var(--primary)] text-[var(--primary-fg)] font-medium shadow-xs'
                  : 'text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)]'
              )}
            >
              Máy chủ MCP ({mcpServers.filter((s) => s.status === 'connected').length}/{mcpServers.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1.5 text-[var(--muted-fg)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm skill, tool…"
              className="w-36 sm:w-48 h-6.5 pl-7 pr-2.5 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--muted-fg)] rounded-lg text-[0.71875rem] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm((prev) => !prev)}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border-0 bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-opacity shadow-xs cursor-pointer"
          >
            <Plus size={12} />
            <span>{activeTab === 'skills' ? 'Thêm skill' : 'Kết nối máy chủ'}</span>
          </button>
        </div>
      </header>

      {/* ── 2. Scrollable Canvas ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--panel)] p-4 custom-scrollbar">
        <div className="max-w-[1280px] mx-auto flex flex-col gap-4">
          {/* Collapsible Add Form */}
          {showAddForm && (
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-4 shadow-[var(--shadow)] flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[var(--accent)]" />
                  <span className="text-[0.8125rem] font-medium text-[var(--fg)]">Đăng ký Skill tùy chỉnh mới</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-[0.71875rem] text-[var(--muted-fg)] hover:text-[var(--fg)] cursor-pointer"
                >
                  Đóng
                </button>
              </div>

              <form onSubmit={handleSaveSkill} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[0.6875rem] font-medium text-[var(--muted-fg)] block mb-1">
                      Tên hiển thị
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="VD: Phân tích rủi ro tín dụng"
                      className="w-full h-7 px-2.5 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] rounded-lg text-[0.75rem] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="text-[0.6875rem] font-medium text-[var(--muted-fg)] block mb-1">
                      Định danh (ID)
                    </label>
                    <input
                      type="text"
                      value={formId}
                      onChange={(e) => setFormId(e.target.value)}
                      placeholder="VD: credit-risk-eval"
                      className="w-full h-7 px-2.5 font-mono bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] rounded-lg text-[0.71875rem] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="text-[0.6875rem] font-medium text-[var(--muted-fg)] block mb-1">
                      Nhóm phân loại
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as SkillCategory)}
                      className="w-full h-7 px-2 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] rounded-lg text-[0.71875rem] outline-none focus:border-[var(--accent)] cursor-pointer"
                    >
                      <option value="Database">Database</option>
                      <option value="Office">Office</option>
                      <option value="Visualization">Visualization</option>
                      <option value="Autonomous">Autonomous</option>
                      <option value="Search & Audit">Search & Audit</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[0.6875rem] font-medium text-[var(--muted-fg)] block mb-1">
                    JSON Schema định nghĩa tham số
                  </label>
                  <textarea
                    rows={6}
                    value={formSchema}
                    onChange={(e) => setFormSchema(e.target.value)}
                    className="w-full p-2.5 font-mono text-[0.6875rem] bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] rounded-lg outline-none focus:border-[var(--accent)] resize-none custom-scrollbar"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--hair)]">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="h-6.5 px-3 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] rounded-lg text-[0.71875rem] cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="h-6.5 px-3 border-0 bg-[var(--primary)] text-[var(--primary-fg)] rounded-lg text-[0.71875rem] font-medium shadow-xs cursor-pointer"
                  >
                    Lưu skill
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab 1: Skills Grid */}
          {activeTab === 'skills' && (
            <div className="flex flex-col gap-4">
              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                {SKILL_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.key;
                  const count =
                    cat.key === 'all'
                      ? skills.length
                      : skills.filter((s) => s.category === cat.key).length;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setSelectedCategory(cat.key)}
                      className={cn(
                        'h-6 px-2.5 rounded-full text-[0.71875rem] font-medium border flex items-center gap-1.5 transition-all duration-150 shrink-0 shadow-2xs cursor-pointer',
                        isSelected
                          ? 'bg-[var(--primary)] text-[var(--primary-fg)] border-transparent'
                          : 'bg-[var(--card)] text-[var(--muted-fg)] border-[var(--border)] hover:text-[var(--fg)] hover:bg-[var(--muted)]'
                      )}
                    >
                      <span>{cat.label}</span>
                      <span
                        className={cn(
                          'text-[0.625rem] font-mono px-1 rounded-full',
                          isSelected
                            ? 'bg-white/20 text-white dark:text-zinc-900 dark:bg-black/20'
                            : 'bg-[var(--muted)] text-[var(--muted-fg)]'
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Grouped Skills by Category with Dividers */}
              {selectedCategory === 'all' ? (
                <div className="flex flex-col gap-6">
                  {CANONICAL_CATEGORIES.map((cat) => {
                    const skillsInCat = filteredSkills.filter((s) => s.category === cat);
                    if (skillsInCat.length === 0) return null;

                    return (
                      <div key={cat} className="flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-[var(--hair)] pb-1.5 pt-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  cat === 'Database'
                                    ? 'var(--c2)'
                                    : cat === 'Office'
                                    ? 'var(--c3)'
                                    : cat === 'Visualization'
                                    ? 'var(--c1)'
                                    : cat === 'Autonomous'
                                    ? 'var(--c4)'
                                    : 'var(--c5)',
                              }}
                            />
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg2)]">
                              {cat}
                            </h3>
                            <span className="text-[0.65625rem] font-mono px-1.5 py-0.25 rounded-md bg-[var(--muted)] text-[var(--muted-fg)] border border-[var(--border)]/50">
                              {skillsInCat.length}
                            </span>
                          </div>
                          <span className="text-[0.65625rem] text-[var(--muted-fg)] font-mono">
                            {skillsInCat.filter((s) => s.enabled).length}/{skillsInCat.length} kích hoạt
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {skillsInCat.map(renderSkillCard)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredSkills.map(renderSkillCard)}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: MCP Servers */}
          {activeTab === 'mcp' && (
            <div className="flex flex-col gap-3">
              {filteredServers.map((srv) => {
                const isExpanded = Boolean(expandedServers[srv.id]);
                const isConfigExpanded = Boolean(expandedConfigs[srv.id]);

                return (
                  <div
                    key={srv.id}
                    className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden hover:-translate-y-1 hover:shadow-md transition-all duration-200"
                  >
                    <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            srv.status === 'connected' && 'bg-[var(--ok)]',
                            srv.status === 'slow' && 'bg-amber-500',
                            srv.status === 'disconnected' && 'bg-[var(--err)]'
                          )}
                        />
                        <div className="min-w-0">
                          <div className="text-[0.8125rem] font-medium text-[var(--fg)] truncate">
                            {srv.name}
                          </div>
                          <div className="font-mono text-[0.6875rem] text-[var(--muted-fg)] truncate">
                            {srv.url}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <span className="font-mono text-[0.6875rem] text-[var(--muted-fg)]">
                          {srv.latency}
                        </span>

                        <span
                          className={cn(
                            'text-[0.65625rem] px-2 py-0.5 rounded-md font-medium border',
                            srv.status === 'connected' &&
                              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                            srv.status === 'slow' &&
                              'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                            srv.status === 'disconnected' &&
                              'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                          )}
                        >
                          {srv.status === 'connected'
                            ? 'Đã kết nối'
                            : srv.status === 'slow'
                            ? 'Chậm'
                            : 'Mất kết nối'}
                        </span>

                        {srv.tools.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleServerExpand(srv.id)}
                            className="h-6.5 px-2 flex items-center gap-1 border border-[var(--border)] rounded-md text-[0.6875rem] text-[var(--fg2)] hover:bg-[var(--muted)] cursor-pointer"
                          >
                            <span>{srv.tools.length} công cụ</span>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        )}

                        {/* MCP Server JSON Configuration Toggle Button */}
                        <button
                          type="button"
                          onClick={() => toggleConfigExpand(srv.id)}
                          className={cn(
                            'h-6.5 px-2 flex items-center gap-1 border border-[var(--border)] rounded-md text-[0.6875rem] transition-colors cursor-pointer',
                            isConfigExpanded
                              ? 'bg-[var(--muted)] text-[var(--fg)] font-medium'
                              : 'text-[var(--fg2)] hover:bg-[var(--muted)]'
                          )}
                        >
                          <Code2 size={12} className="text-[var(--accent)]" />
                          <span>JSON</span>
                          {isConfigExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      </div>
                    </div>

                    {/* Tools chips accordion */}
                    {isExpanded && srv.tools.length > 0 && (
                      <div className="px-3.5 pb-3 pt-1 border-t border-[var(--hair)] bg-[var(--panel)]/40 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[0.65625rem] text-[var(--muted-fg)] uppercase tracking-wider font-mono mr-1">
                          Tools:
                        </span>
                        {srv.tools.map((t) => (
                          <span
                            key={t}
                            className="font-mono text-[0.65625rem] px-2 py-0.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-[var(--fg2)] shadow-xs"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* MCP Configuration JSON Preview Block */}
                    {isConfigExpanded && (
                      <div className="px-3.5 pb-3.5 pt-2 border-t border-[var(--hair)] bg-[var(--panel)]/30 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-[0.6875rem] text-[var(--muted-fg)]">
                          <span className="font-mono flex items-center gap-1.5 text-[0.6875rem]">
                            <Code2 size={12} className="text-[var(--accent)]" />
                            mcp_config.json ({srv.id})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyConfig(srv.id, srv.configJson)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-[var(--card)] text-[0.6875rem] border border-[var(--border)]/50 transition-colors cursor-pointer"
                          >
                            {copiedConfigId === srv.id ? (
                              <>
                                <Check size={11} className="text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Đã chép</span>
                              </>
                            ) : (
                              <>
                                <Copy size={11} />
                                <span>Sao chép</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="font-mono text-xs p-3 rounded-lg bg-[var(--code)] text-[var(--muted-fg)] border border-[var(--border)] overflow-x-auto custom-scrollbar select-text leading-relaxed">
                          <code>{srv.configJson}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OpenWorkSkillsMcpPage;
