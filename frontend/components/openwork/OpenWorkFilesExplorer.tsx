import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Search,
  FileCode2,
  FileSpreadsheet,
  Layers,
  FileText,
  ImageIcon,
} from 'lucide-react';
import type { OpenWorkArtifact, OpenWorkArtifactTab } from './types';
import './styles/openwork-files.css';

export interface OpenWorkFilesExplorerProps {
  artifacts: OpenWorkArtifact[];
  onSelectTab: (tab: OpenWorkArtifactTab, artifactId?: string) => void;
  activeArtifactId?: string;
  className?: string;
}

// ── Monochrome SVG File Icons ─────────────────────────────────────────────
const PythonSvgIcon = () => (
  <svg className="ow-fx-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.91 2c-5.06 0-4.73 2.19-4.73 2.19l.01 2.28h4.82v.69H5.21S2 6.8 2 11.89c0 5.1 2.8 4.93 2.8 4.93h1.67v-2.33s-.09-2.8 2.76-2.8h4.74s2.68.04 2.68-2.61V4.68S16.97 2 11.91 2zm-2.6 1.48a.92.92 0 110 1.84.92.92 0 010-1.84zM12.09 22c5.06 0 4.73-2.19 4.73-2.19l-.01-2.28h-4.82v-.69h6.8s3.21.36 3.21-4.73c0-5.1-2.8-4.93-2.8-4.93h-1.67v2.33s.09 2.8-2.76 2.8h-4.74s-2.68-.04-2.68 2.61v4.29s-.33 2.68 4.73 2.68zm2.6-1.48a.92.92 0 110-1.84.92.92 0 010 1.84z" />
  </svg>
);

const TypeScriptSvgIcon = () => (
  <svg className="ow-fx-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 3h18v18H3V3zm10.72 13.84c.81.48 1.8.76 2.8.76 2.18 0 3.48-1.12 3.48-2.92 0-1.66-1.04-2.52-2.82-3.14l-.76-.26c-1.02-.36-1.5-.78-1.5-1.48 0-.74.62-1.32 1.66-1.32.86 0 1.54.26 2.06.6l.66-1.32c-.68-.46-1.6-.74-2.68-.74-2.02 0-3.32 1.16-3.32 2.82 0 1.56.98 2.44 2.68 3.04l.76.28c1.1.4 1.64.84 1.64 1.58 0 .84-.74 1.44-1.88 1.44-.98 0-1.86-.34-2.48-.76l-.64 1.34zm-5.72-8.34v9.64h1.76V8.5h2.52V7H5.2v1.5h2.52z" />
  </svg>
);

const SqlSvgIcon = () => (
  <svg className="ow-fx-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

// Icon follows the file itself: a code artifact is python or sql or ts by its
// own extension, everything else by the tab it opens in.
const renderIcon = (artifact: OpenWorkArtifact) => {
  if (artifact.type === 'code') {
    const ext = (artifact.extension || artifact.name.split('.').pop() || '').toLowerCase();
    if (ext === 'py') return <PythonSvgIcon />;
    if (ext === 'sql') return <SqlSvgIcon />;
    if (ext === 'ts' || ext === 'tsx' || ext === 'js') return <TypeScriptSvgIcon />;
    return <FileCode2 size={14} className="ow-fx-icon" />;
  }
  switch (artifact.type) {
    case 'excel':
      return <FileSpreadsheet size={14} className="ow-fx-icon" />;
    case 'slide':
      return <Layers size={14} className="ow-fx-icon" />;
    case 'docx':
      return <FileText size={14} className="ow-fx-icon" />;
    case 'chart':
      return <ImageIcon size={14} className="ow-fx-icon" />;
    default:
      return <FileCode2 size={14} className="ow-fx-icon" />;
  }
};

const relativeTime = (iso: string): string => {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return new Date(then).toLocaleDateString('vi-VN');
};

const SECTIONS: Array<{ key: string; label: string; types: OpenWorkArtifactTab[]; empty: string }> = [
  { key: 'code', label: 'Mã nguồn', types: ['code'], empty: 'Chưa có truy vấn hay script nào chạy.' },
  { key: 'docs', label: 'Tài liệu', types: ['excel', 'slide', 'docx'], empty: 'Chưa có bảng tính, slide hay văn bản nào.' },
  { key: 'media', label: 'Biểu đồ', types: ['chart'], empty: 'Chưa có biểu đồ nào được dựng.' },
];

export const OpenWorkFilesExplorer: React.FC<OpenWorkFilesExplorerProps> = ({
  artifacts,
  onSelectTab,
  activeArtifactId,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Every row is a real artifact from the session. Nothing here is invented:
  // an empty workspace reads as empty.
  const sections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = (artifacts || []).filter(
      (a) => !q || `${a.name} ${a.title || ''}`.toLowerCase().includes(q)
    );
    return SECTIONS.map((s) => ({ ...s, items: list.filter((a) => s.types.includes(a.type)) }));
  }, [artifacts, searchQuery]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className={`ow-fx ${className}`}>
      <div className="ow-fx-head">
        <div className="ow-fx-search">
          <Search size={12} className="ow-fx-search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Lọc tệp tin trong phiên làm việc..."
            aria-label="Lọc tệp tin trong phiên làm việc"
            className="ow-fx-input"
          />
        </div>
        <span className="ow-fx-count">{total} tệp</span>
      </div>

      {(artifacts || []).length === 0 ? (
        <div className="ow-fx-empty">
          <span className="ow-fx-empty-title">Workspace trống</span>
          <span className="ow-fx-empty-text">
            Mọi tệp AI tạo ra trong phiên này — truy vấn, bảng tính, slide, biểu đồ — sẽ xuất hiện ở đây.
          </span>
        </div>
      ) : (
        <div className="ow-fx-tree custom-scrollbar">
          {sections.map((section) => (
            <div key={section.key} className="ow-fx-section">
              <button
                type="button"
                onClick={() => toggleSection(section.key)}
                aria-expanded={!collapsed[section.key]}
                aria-label={`Thu gọn hoặc mở rộng mục ${section.label}`}
                className="ow-fx-section-head"
              >
                <span className="ow-fx-section-label">
                  {section.label}
                  <span className="ow-fx-section-count">{section.items.length}</span>
                </span>
                {collapsed[section.key] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>

              {!collapsed[section.key] &&
                (section.items.length === 0 ? (
                  <span className="ow-fx-section-empty">{section.empty}</span>
                ) : (
                  section.items.map((a) => {
                    const open = () => onSelectTab(a.type, a.id);
                    const time = relativeTime(a.updatedAt);
                    return (
                      <div
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        onClick={open}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            open();
                          }
                        }}
                        className={`ow-fx-row${a.id === activeArtifactId ? ' is-active' : ''}`}
                      >
                        <span className="ow-fx-row-left">
                          {renderIcon(a)}
                          <span className="ow-fx-row-text">
                            <span className="ow-fx-name">{a.name}</span>
                            <span className="ow-fx-sub">
                              {[a.title, time].filter(Boolean).join(' • ')}
                            </span>
                          </span>
                        </span>
                        {a.status === 'ready' ? (
                          <span className="ow-fx-chip">v{a.version || 1}.0</span>
                        ) : (
                          <span className="ow-fx-chip ow-fx-chip--live">
                            {a.status === 'error' ? 'Lỗi' : 'Đang tạo'}
                          </span>
                        )}
                      </div>
                    );
                  })
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OpenWorkFilesExplorer;
