/**
 * Pure Stream Entity & Relationship Extractor
 * OpenWork Coworker Platform - Milestone 2
 */

import type { OpenWorkStreamPart, OpenWorkArtifactTab, CapabilityCallPart } from '../types';
import type {
  FireworksGraphData,
  GraphEntityNode,
  GraphEntityLink,
  GraphNodeCategory,
  ArtifactBuildStage,
  LiveBoxTabId,
} from './types';

export const CATEGORY_COLORS: Record<GraphNodeCategory, string> = {
  database: '#3b82f6', // Blue
  table: '#10b981',    // Emerald
  metric: '#f59e0b',   // Amber
  concept: '#8b5cf6',  // Purple
  source: '#06b6d4',   // Cyan
  artifact: '#f43f5e', // Rose
};

export function formatStopwatchMs(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

export function getFaviconUrl(urlOrDomain: string): string {
  const domain = cleanDomain(urlOrDomain);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export function getArtifactStages(type: OpenWorkArtifactTab): ArtifactBuildStage[] {
  switch (type) {
    case 'excel':
      return [
        { step: 1, total: 4, label: 'Schema Definition', description: 'Khởi tạo cấu trúc 4 Sheet & Metadata' },
        { step: 2, total: 4, label: 'Raw Ingestion', description: 'Nạp dữ liệu thô Raw_Data' },
        { step: 3, total: 4, label: 'Formula Synthesis', description: 'Tính toán công thức SUM, AVERAGE, VLOOKUP' },
        { step: 4, total: 4, label: 'KPI Dashboard', description: 'Định dạng chỉ số & Highlight Dashboard' },
      ];
    case 'slide':
      return [
        { step: 1, total: 5, label: 'Cover & Hero', description: 'Slide bìa thuyết trình 16:9' },
        { step: 2, total: 5, label: 'Executive Summary', description: 'Tóm tắt chiến lược điều hành' },
        { step: 3, total: 5, label: 'KPI Matrix', description: 'Ma trận chỉ số 2 cột' },
        { step: 4, total: 5, label: 'Bento Framework', description: 'Khung phân tích Bento Grid' },
        { step: 5, total: 5, label: 'Strategic Roadmap', description: 'Lộ trình hành động Timeline' },
      ];
    case 'docx':
      return [
        { step: 1, total: 3, label: 'Header & Code', description: 'Mã hiệu phân loại thể chế' },
        { step: 2, total: 3, label: 'Scorecard Metrics', description: 'Bảng điểm chỉ số tài chính' },
        { step: 3, total: 3, label: 'Strategic Theses', description: 'Luận điểm ngắn/dài hạn & Khuyến nghị' },
      ];
    case 'code':
    default:
      return [
        { step: 1, total: 3, label: 'Environment Setup', description: 'Khởi tạo môi trường Sandbox' },
        { step: 2, total: 3, label: 'Script Execution', description: 'Thực thi mã nguồn Python/SQL' },
        { step: 3, total: 3, label: 'Output Verification', description: 'Kiểm định DataFrame & Kết quả' },
      ];
  }
}

export function determineAutoActiveTab(
  streamParts: OpenWorkStreamPart[],
  isStreaming: boolean
): LiveBoxTabId {
  if (!streamParts || streamParts.length === 0) {
    return 'graph';
  }

  // 1. Check for Active Artifact Generation / Suggestions
  const hasGeneratingArtifact = streamParts.some((p) => {
    if (p.type === 'capability-call') {
      const name = p.toolName.toLowerCase();
      return (
        name.includes('spreadsheet') ||
        name.includes('presentation') ||
        name.includes('doc_writer') ||
        name.includes('chart')
      );
    }
    if (p.type === 'text' && p.suggestedArtifactTab) return true;
    return false;
  });

  if (hasGeneratingArtifact) {
    return 'build';
  }

  // 2. Check for Active Web Searches & Radar Sources
  const hasRadarSources = streamParts.some(
    (p) =>
      p.type === 'source-cards' ||
      (p.type === 'capability-call' &&
        (p.toolName.toLowerCase().includes('search') ||
          p.toolName.toLowerCase().includes('web') ||
          p.toolName.toLowerCase().includes('crawl') ||
          p.toolName.toLowerCase().includes('scrape') ||
          p.toolName.toLowerCase().includes('fetch')))
  );

  if (hasRadarSources && isStreaming) {
    return 'radar';
  }

  // 3. Check for Running SQL / Python / Terminal Capability Calls
  const activeTerminalCall = streamParts.find(
    (p): p is CapabilityCallPart =>
      p.type === 'capability-call' &&
      (p.toolName.toLowerCase().includes('sql') ||
        p.toolName.toLowerCase().includes('query') ||
        p.toolName.toLowerCase().includes('python') ||
        p.toolName.toLowerCase().includes('code') ||
        p.toolName.toLowerCase().includes('db') ||
        p.toolName.toLowerCase().includes('terminal') ||
        p.toolName.toLowerCase().includes('bash'))
  );

  if (activeTerminalCall && (activeTerminalCall.status === 'running' || isStreaming)) {
    return 'terminal';
  }

  // Default to Tech Graph
  return 'graph';
}

const SQL_KEYWORDS = new Set([
  'SELECT', 'WHERE', 'VALUES', 'SET', 'LATERAL', 'GROUP', 'ORDER',
  'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'AS', 'ON', 'JOIN', 'INNER',
  'LEFT', 'RIGHT', 'OUTER', 'CROSS', 'TABLE', 'INDEX', 'VIEW', 'AND',
  'OR', 'NOT', 'NULL', 'IS', 'IN', 'EXISTS', 'BETWEEN', 'LIKE',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'FROM', 'INTO', 'UPDATE',
]);

const KNOWN_DATABASES = [
  'VN_Ecommerce',
  'VN_Inventory',
  'VN_Marketing',
  'VN_Finance',
  'Walmart_Sales',
  'SQLite',
  'Postgres',
  'ClickHouse',
  'DuckDB',
  'MySQL',
];

const KNOWN_KPIS = [
  'ROAS',
  'CAC',
  'LTV',
  'GMV',
  'Revenue',
  'Profit',
  'Margin',
  'Return Rate',
  'Conversion Rate',
  'AOV',
  'Budget Variance',
  'Inventory Turnover',
  'Defect Rate',
  'Growth Rate',
  'Pareto 80/20',
  'Safety Stock',
  'Stockout Risk',
];

const KNOWN_CONCEPTS = [
  'Pareto 80/20',
  'Cohort Analysis',
  'ROAS Optimization',
  'A/B Testing',
  'Crisis Alert',
  'Safety Stock',
  'Channel Growth',
  'Sensitivity Matrix',
  'Budget Allocation',
  'Churn Reduction',
  'Price Elasticity',
  'Supply Chain Resilience',
];

export function cleanDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.replace(/^(?:https?:\/\/)?(?:www\.)?/, '').split('/')[0].toLowerCase();
  }
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Extracts SQL table names from a query string.
 */
export function extractTablesFromSql(sql: string): string[] {
  if (!sql) return [];
  const tables = new Set<string>();
  const regex = /(?:FROM|JOIN|INTO|UPDATE)\s+([`"'[\]]?[a-zA-Z0-9_]+[`"'[\]]?(?:\.[`"'[\]]?[a-zA-Z0-9_]+[`"'[\]]?)?)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sql)) !== null) {
    let raw = match[1].replace(/[`"'[\]]/g, '').trim();
    if (!raw) continue;

    // If database.table notation, take the table part
    if (raw.includes('.')) {
      const parts = raw.split('.');
      raw = parts[parts.length - 1];
    }

    const upper = raw.toUpperCase();
    if (!SQL_KEYWORDS.has(upper) && raw.length > 1 && !/^\d+$/.test(raw)) {
      tables.add(raw);
    }
  }

  return Array.from(tables);
}

/**
 * Extracts SQL aggregate metric names from a query string.
 */
export function extractMetricsFromSql(sql: string): string[] {
  if (!sql) return [];
  const metrics = new Set<string>();
  const regex = /(?:SUM|AVG|COUNT|MIN|MAX|MEDIAN)\s*\(\s*(?:DISTINCT\s+)?([a-zA-Z0-9_.*]+)\s*\)(?:\s+AS\s+([a-zA-Z0-9_]+))?/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sql)) !== null) {
    if (match[2]) {
      metrics.add(match[2].replace(/[`"'[\]]/g, '').trim());
    } else if (match[1] && match[1] !== '*') {
      metrics.add(match[1].replace(/[`"'[\]]/g, '').trim());
    }
  }

  return Array.from(metrics);
}

/**
 * Pure extractor function converting OpenWorkStreamPart[] to a full FireworksGraphData model.
 */
export function extractEntitiesFromStreamParts(
  streamParts: OpenWorkStreamPart[]
): FireworksGraphData {
  const nodeMap = new Map<string, GraphEntityNode>();
  const linkMap = new Map<string, GraphEntityLink>();

  const addNode = (
    category: GraphNodeCategory,
    rawName: string,
    val: number,
    details?: Record<string, any>
  ): GraphEntityNode => {
    const id = `${category}:${slugify(rawName)}`;
    if (nodeMap.has(id)) {
      const existing = nodeMap.get(id)!;
      existing.val = Math.max(existing.val, val);
      if (details) {
        existing.details = { ...existing.details, ...details };
      }
      return existing;
    }

    const node: GraphEntityNode = {
      id,
      name: rawName,
      category,
      val,
      color: CATEGORY_COLORS[category],
      details,
      isNew: true,
      timestamp: Date.now(),
    };
    nodeMap.set(id, node);
    return node;
  };

  const addLink = (
    sourceId: string,
    targetId: string,
    relation: string,
    color?: string
  ) => {
    if (sourceId === targetId || !nodeMap.has(sourceId) || !nodeMap.has(targetId)) {
      return;
    }
    const linkId = `${sourceId}->${targetId}:${relation}`;
    if (!linkMap.has(linkId)) {
      linkMap.set(linkId, {
        id: linkId,
        source: sourceId,
        target: targetId,
        relation,
        color: color || '#71717a',
        animated: true,
      });
    }
  };

  for (const part of streamParts) {
    // 1. Capability Call (SQL, Python, DB queries, Web Searches, Artifact Tools)
    if (part.type === 'capability-call') {
      const codeSnippet = part.codeSnippet || '';
      const input = part.input || {};
      const output = part.output;

      // Database Detection
      let currentDbNode: GraphEntityNode | null = null;
      const detectedDbName =
        input.database ||
        input.datasource ||
        KNOWN_DATABASES.find((db) =>
          codeSnippet.toLowerCase().includes(db.toLowerCase())
        );

      if (detectedDbName) {
        currentDbNode = addNode('database', detectedDbName, 10, {
          tool: part.toolName,
          status: part.status,
        });
      }

      // Tables from SQL / Code
      const extractedTables = extractTablesFromSql(codeSnippet);
      const tableNodes: GraphEntityNode[] = [];

      for (const tbl of extractedTables) {
        const tblNode = addNode('table', tbl, 7, {
          database: detectedDbName,
        });
        tableNodes.push(tblNode);
        if (currentDbNode) {
          addLink(currentDbNode.id, tblNode.id, 'CONTAINS', '#3b82f6');
        }
      }

      // Metrics from SQL
      const extractedMetrics = extractMetricsFromSql(codeSnippet);
      for (const mtr of extractedMetrics) {
        const mtrNode = addNode('metric', mtr, 6);
        for (const tblNode of tableNodes) {
          addLink(tblNode.id, mtrNode.id, 'EXTRACTS', '#10b981');
        }
      }

      // Artifact Detection from Tools
      if (
        part.toolName.includes('spreadsheet') ||
        part.toolName.includes('presentation') ||
        part.toolName.includes('doc_writer') ||
        part.toolName.includes('chart') ||
        codeSnippet.includes('.xlsx') ||
        codeSnippet.includes('.pptx') ||
        codeSnippet.includes('.docx')
      ) {
        const artName =
          input.filename ||
          input.title ||
          (part.toolName.includes('spreadsheet')
            ? 'Workbook.xlsx'
            : part.toolName.includes('presentation')
            ? 'Deck.pptx'
            : part.toolName.includes('doc_writer')
            ? 'Report.docx'
            : 'Artifact');
        const artNode = addNode('artifact', artName, 9, {
          tool: part.toolName,
        });
        for (const tblNode of tableNodes) {
          addLink(tblNode.id, artNode.id, 'BUILDS', '#f43f5e');
        }
      }
    }

    // 2. Source Cards Part (Web Search Citations)
    if (part.type === 'source-cards') {
      for (const res of part.results || []) {
        const domain = cleanDomain(res.url);
        if (domain) {
          addNode('source', domain, 5, {
            url: res.url,
            title: res.title,
            snippet: res.snippet,
          });
        }
      }
    }

    // 3. Reasoning & Assistant Text Scanning (Concepts & KPIs)
    const textCorpus =
      (part.type === 'reasoning' ? part.thought : '') +
      ' ' +
      (part.type === 'text' ? (part.markdown || '') + ' ' + (part.keyPoints || []).join(' ') : '') +
      ' ' +
      (part.type === 'subagent-run' ? part.taskTitle + ' ' + (part.outputSummary || '') : '');

    if (textCorpus.trim()) {
      // Check Concepts
      for (const concept of KNOWN_CONCEPTS) {
        if (new RegExp(`\\b${concept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(textCorpus)) {
          addNode('concept', concept, 6);
        }
      }

      // Check Known KPIs
      for (const kpi of KNOWN_KPIS) {
        if (new RegExp(`\\b${kpi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(textCorpus)) {
          addNode('metric', kpi, 6);
        }
      }

      // Check Suggested Artifact Tab
      if (part.type === 'text' && part.suggestedArtifactTab) {
        const tab = part.suggestedArtifactTab;
        const artTitle =
          tab === 'excel'
            ? 'Financial_Model.xlsx'
            : tab === 'slide'
            ? 'Executive_Deck.pptx'
            : tab === 'docx'
            ? 'Tear_Sheet.docx'
            : `${tab.toUpperCase()}_Artifact`;
        addNode('artifact', artTitle, 8, { tab });
      }
    }
  }

  // Cross-link synthesis: Connect orphan concepts or metrics
  const nodes = Array.from(nodeMap.values());
  const metrics = nodes.filter((n) => n.category === 'metric');
  const artifacts = nodes.filter((n) => n.category === 'artifact');
  const concepts = nodes.filter((n) => n.category === 'concept');
  const sources = nodes.filter((n) => n.category === 'source');

  // Link metrics to artifacts
  for (const mtr of metrics) {
    for (const art of artifacts) {
      addLink(mtr.id, art.id, 'BUILDS', '#f43f5e');
    }
  }

  // Link sources to concepts or metrics
  for (const src of sources) {
    for (const concept of concepts) {
      addLink(src.id, concept.id, 'REFERENCES', '#06b6d4');
    }
  }

  const links = Array.from(linkMap.values());

  return {
    nodes,
    links,
    metrics: {
      totalEntities: nodes.length,
      databasesCount: nodes.filter((n) => n.category === 'database').length,
      tablesCount: nodes.filter((n) => n.category === 'table').length,
      metricsCount: metrics.length,
      sourcesCount: sources.length,
      artifactsCount: artifacts.length,
    },
    discoveredCount: nodes.length,
  };
}
