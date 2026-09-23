import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const DocxArtifactViewer = dynamic(
  () => import('@/components/ai-data-analytic/office-word/WordArtifactViewer'),
  { ssr: false }
);
const ExcelArtifactViewer = dynamic(
  () => import('@/components/ai-data-analytic/office-excel/ExcelArtifactViewer'),
  { ssr: false }
);
const SlideArtifactViewer = dynamic(
  () => import('@/components/ai-data-analytic/office-slides/SlideArtifactViewer'),
  { ssr: false }
);

/**
 * Test page: /test-viewers
 * Renders all 3 Office artifact viewers with real/mock data for E2E verification.
 */
export default function TestViewersPage() {
  const [activeViewer, setActiveViewer] = useState<'docx' | 'excel' | 'slide'>('docx');

  // Docx: use the real cat_about.docx via backend download
  const docxArtifact = {
    id: 'test-docx-1',
    name: 'cat_about.docx',
    type: 'file' as const,
    content: {
      file_path: 'D:\\DB-GPT\\pilot\\tmp\\93441a8f-944c-4f0a-8e9d-b4022fc6328e\\cat_about.docx',
    },
  };

  // Excel: use the test spreadsheet
  const excelArtifact = {
    id: 'test-xlsx-1',
    name: 'spreadsheet_financial_operational_2025.xlsx',
    type: 'file' as const,
    content: {
      file_path: 'D:\\DB-GPT\\backend\\dbgpt-analyst\\test_outputs\\spreadsheet_financial_operational_2025.xlsx',
    },
  };

  // Slide: structured JSON data (this is how slides come from the backend)
  const slideArtifact = {
    id: 'test-slide-1',
    name: 'AI Strategy Presentation',
    type: 'slide' as const,
    content: {
      slides: [
        {
          layout: 'hero',
          title: 'Enterprise AI Architecture & Strategy 2026',
          subtitle: 'Multi-Agent Analytics Framework for Data-Driven Decision Making',
          date: 'FY 2026 Q4',
          impact_stat: '+42% Revenue YoY',
        },
        {
          layout: 'stat_grid',
          title: 'Key Performance Indicators',
          stats: [
            { label: 'Annual Revenue', value: '$12.4M', trend: '+42%' },
            { label: 'Active Agents', value: '2,847', trend: '+156%' },
            { label: 'Avg Response Time', value: '1.2s', trend: '-68%' },
            { label: 'Data Sources', value: '340+', trend: '+89%' },
            { label: 'Customer NPS', value: '94', trend: '+12' },
            { label: 'Uptime SLA', value: '99.97%', trend: 'Maintained' },
          ],
        },
        {
          layout: 'bullets',
          title: 'Product Roadmap Highlights',
          bullets: [
            'Q1: Launch real-time streaming analytics with sub-second latency',
            'Q2: Integrate DeepSeek V4 and GPT-5 for multi-model orchestration',
            'Q3: Release enterprise SSO and RBAC with audit logging',
            'Q4: Ship self-hosted deployment with Kubernetes operator',
          ],
          takeaway: 'Four major releases targeting enterprise adoption and scale.',
        },
        {
          layout: 'two_col',
          title: 'Architecture Comparison',
          left_title: 'Traditional Analytics',
          left_bullets: ['Manual SQL queries', 'Static dashboards', 'Weekly batch reports', 'Single data source'],
          right_title: 'AI-Powered Analytics',
          right_bullets: ['Natural language queries', 'Dynamic visualizations', 'Real-time streaming', 'Multi-source fusion'],
        },
        {
          layout: 'closing',
          title: 'Thank You',
          cta: 'Start your AI analytics journey today',
          contact_info: 'team@dbgpt.ai | github.com/eosphoros-ai/DB-GPT',
        },
      ],
    },
  };

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950">
      {/* Tab Bar */}
      <div className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            🧪 Office Viewer Test Page
          </h1>
          <div className="flex gap-1 ml-4">
            {(['docx', 'excel', 'slide'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveViewer(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeViewer === tab
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {tab === 'docx' ? '📄 Word (.docx)' : tab === 'excel' ? '📊 Excel (.xlsx)' : '🎤 Slide (.pptx)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Viewer Area */}
      <div className="max-w-7xl mx-auto" style={{ height: 'calc(100vh - 64px)' }}>
        {activeViewer === 'docx' && (
          <DocxArtifactViewer artifact={docxArtifact} />
        )}
        {activeViewer === 'excel' && (
          <ExcelArtifactViewer artifact={excelArtifact} />
        )}
        {activeViewer === 'slide' && (
          <SlideArtifactViewer artifact={slideArtifact} />
        )}
      </div>
    </div>
  );
}
