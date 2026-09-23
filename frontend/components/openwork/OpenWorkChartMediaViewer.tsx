import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { normalizeChart } from '@/lib/charts/normalizeChart';
import { buildChartGeometry, toPythonScript, toTsv } from '@/lib/charts/chartGeometry';
import type { OpenWorkArtifact } from './types';
import './styles/openwork-chart.css';

export interface OpenWorkChartMediaViewerProps {
  artifact?: OpenWorkArtifact;
  className?: string;
}

const SVG_ID = 'openwork-svg-chart';
const VIEWS = [
  { id: 'chart', label: 'Biểu đồ' },
  { id: 'data', label: 'Dữ liệu' },
  { id: 'python', label: 'Code' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

export const OpenWorkChartMediaViewer: React.FC<OpenWorkChartMediaViewerProps> = ({
  artifact,
  className = '',
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [activeView, setActiveView] = useState<ViewId>('chart');
  const [copied, setCopied] = useState<boolean>(false);

  const fileName = artifact?.name || 'chart.svg';

  // The artifact is the only source of numbers. When it carries none, the
  // model is null and the pane says so — it never falls back to a sample.
  const model = useMemo(() => normalizeChart(artifact), [artifact]);
  const geometry = useMemo(() => (model ? buildChartGeometry(model) : null), [model]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const svgEl = document.getElementById(SVG_ID);
    if (!svgEl) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.replace(/\.[^/.]+$/, '') + '.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!model || !geometry) {
    return (
      <div className={`ow-chart ${className}`}>
        <div className="ow-chart-canvas">
          <div className="ow-chart-empty">
            <div className="ow-chart-empty-title">Chưa có số liệu để vẽ</div>
            <p className="ow-chart-empty-text">
              Kết quả hiện tại không chứa cột số nào. Chạy một truy vấn trả về số liệu, biểu đồ sẽ
              dựng từ chính kết quả đó.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`ow-chart ${className}`}>
      <div className="ow-chart-bar">
        <div className="ow-chart-seg" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={activeView === v.id}
              onClick={() => setActiveView(v.id)}
              className={`ow-chart-seg-btn${activeView === v.id ? ' is-active' : ''}`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="ow-chart-sep" />

        {activeView === 'chart' ? (
          <>
            <button
              type="button"
              className="ow-chart-btn"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
              title="Thu nhỏ"
              aria-label="Thu nhỏ biểu đồ"
            >
              <ZoomOut size={13} />
            </button>
            <span className="ow-chart-zoom">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="ow-chart-btn"
              onClick={() => setZoom((z) => Math.min(2, z + 0.15))}
              title="Phóng to"
              aria-label="Phóng to biểu đồ"
            >
              <ZoomIn size={13} />
            </button>
            <button
              type="button"
              className="ow-chart-btn"
              onClick={() => setZoom(1)}
              title="Đặt lại zoom"
              aria-label="Đặt lại kích thước chuẩn"
            >
              <RotateCcw size={12} />
            </button>
            <button
              type="button"
              className="ow-chart-btn"
              onClick={handleDownload}
              title="Tải xuống biểu đồ SVG"
              aria-label="Tải xuống biểu đồ SVG"
            >
              <Download size={13} />
              Tải về
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ow-chart-btn"
            onClick={() => copyText(activeView === 'data' ? toTsv(model) : toPythonScript(model))}
            title={activeView === 'data' ? 'Sao chép bảng' : 'Sao chép mã'}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Đã sao chép' : 'Sao chép'}
          </button>
        )}
      </div>

      <div className="ow-chart-canvas">
        <div
          className="ow-chart-stage"
          style={activeView === 'chart' ? { transform: `scale(${zoom})` } : undefined}
        >
          {activeView === 'chart' && (
            <div className="ow-chart-card">
              <div className="ow-chart-head">
                <div className="ow-part-title">{model.title}</div>
                <div className="ow-chart-legend">
                  {model.series.map((s, i) => (
                    <span key={s.name} className="ow-chart-legend-item ow-meta">
                      <span className={`ow-chart-swatch ow-chart-s${i}`} />
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>

              <svg
                id={SVG_ID}
                className="ow-chart-svg"
                viewBox={`0 0 ${geometry.width} ${geometry.height}`}
                role="img"
                aria-label={model.title}
              >
                {geometry.gridlines.map((g) => (
                  <g key={g.value}>
                    <line
                      className="ow-chart-grid"
                      x1={geometry.plot.x}
                      y1={g.y}
                      x2={geometry.plot.x + geometry.plot.width}
                      y2={g.y}
                    />
                    <text className="ow-chart-axis" x={geometry.plot.x - 8} y={g.y + 4} textAnchor="end">
                      {g.label}
                    </text>
                  </g>
                ))}

                {geometry.bars.map((b) => (
                  <rect
                    key={`${b.categoryIndex}-${b.seriesIndex}`}
                    className={`ow-chart-s${b.seriesIndex}`}
                    x={b.x}
                    y={b.y}
                    width={b.width}
                    height={b.height}
                    rx="2"
                  >
                    <title>{`${b.category} · ${b.series}: ${b.value}`}</title>
                  </rect>
                ))}

                {geometry.ticks.map((t) => (
                  <text
                    key={t.label}
                    className="ow-chart-tick"
                    x={t.x}
                    y={geometry.plot.y + geometry.plot.height + 20}
                    textAnchor="middle"
                  >
                    {t.label}
                  </text>
                ))}
              </svg>

              <div className="ow-chart-stats">
                {geometry.stats.map((s) => (
                  <div key={s.label} className="ow-chart-stat">
                    <span className="ow-label">{s.label}</span>
                    <span className="ow-chart-stat-value">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === 'data' && (
            <div className="ow-chart-card">
              <table className="ow-chart-table">
                <thead>
                  <tr>
                    <th className="ow-label">{model.categoryLabel}</th>
                    {model.series.map((s) => (
                      <th key={s.name} className="ow-label">
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.categories.map((c, i) => (
                    <tr key={`${c}-${i}`}>
                      <td>{c}</td>
                      {model.series.map((s) => (
                        <td key={s.name}>{s.values[i] ?? 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeView === 'python' && <pre className="ow-chart-code">{toPythonScript(model)}</pre>}
        </div>
      </div>
    </div>
  );
};

export default OpenWorkChartMediaViewer;
