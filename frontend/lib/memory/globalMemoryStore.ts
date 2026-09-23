/**
 * globalMemoryStore.ts — Persistent Global Agent Memory Subsystem
 *
 * Provides:
 * 1. Structured `AgentMemoryCard` entities (rules, formulas, assumptions, preferences).
 * 2. Partitioned persistent storage using RFC 9562 UUIDv7 (`openwork:v7:{tenant}:{user}:global:memory-cards`).
 * 3. Default enterprise seed memory cards (Net Revenue, 8% VAT deduction, Spoilage allowance, Omnichannel CM1, Reporting preference).
 * 4. System prompt injection formatter (`formatMemoriesForSystemPrompt`) with enabled filtering & pinned priority.
 * 5. Passive and heuristic auto-extraction parser (`extractMemoryCardsFromText`).
 * 6. Full JSON export/import capabilities with schema validation and sanitization.
 */

import {
  generateUUIDv7,
  isValidUUIDv7,
  storageManager,
  GLOBAL_SESSION_ID,
} from '../security/storage-manager';

// ── Types & Interfaces ──

export type MemoryCardType = 'rule' | 'formula' | 'preference' | 'assumption';

export interface AgentMemoryCard {
  id: string;                    // RFC 9562 UUIDv7
  type: MemoryCardType;          // Category of knowledge
  title: string;                 // Concise title
  content: string;               // Formula formula, rule logic, or business assumption
  category: string;              // "Finance", "Tax", "Retail", "Agri", "Reporting", "General"
  tags: string[];                // ["revenue", "vat", "spoilage"]
  sourceSessionId?: string;      // Origin conversation ID or "manual"
  sourceMessageId?: string;      // Origin message ID if auto-extracted
  confidence?: number;           // 0.0 - 1.0 (default 1.0 for manual, 0.9+ for auto-extracted)
  isPinned: boolean;             // Pinned cards get prioritized in prompt assembly
  isEnabled: boolean;            // Enable/disable card without deletion
  createdAt: string;             // ISO 8601 string
  updatedAt: string;             // ISO 8601 string
}

export const GLOBAL_MEMORY_STORAGE_TYPE = 'memory-cards';

// ── Default Enterprise Seed Memory Cards ──

export const DEFAULT_ENTERPRISE_MEMORY_CARDS: AgentMemoryCard[] = [
  {
    id: '019183ab-0001-7000-8000-000000000001',
    type: 'formula',
    title: 'Công thức Doanh Thu Thuần (Net Revenue)',
    content: 'Doanh Thu Thuần = Doanh Thu Gộp - (Chiết Khấu Bán Hàng + Hàng Bán Bị Trả Lại + Giảm Giá Hàng Bán)',
    category: 'Finance',
    tags: ['revenue', 'net-revenue', 'deductions', 'pnl'],
    sourceSessionId: 'enterprise-seed',
    confidence: 1.0,
    isPinned: true,
    isEnabled: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: '019183ab-0002-7000-8000-000000000002',
    type: 'rule',
    title: 'Khấu trừ Thuế VAT 8% (Nghị định 72/2024)',
    content: 'Khi tính toán doanh thu thuần từ tổng hóa đơn thanh toán khách hàng (Gross bill đã gồm VAT), bắt buộc bóc tách thuế VAT 8% (Doanh thu chưa VAT = Tổng bill / 1.08) trước khi tính biên lợi nhuận.',
    category: 'Tax',
    tags: ['tax', 'vat', 'accounting', 'vietnam'],
    sourceSessionId: 'enterprise-seed',
    confidence: 1.0,
    isPinned: true,
    isEnabled: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: '019183ab-0003-7000-8000-000000000003',
    type: 'assumption',
    title: 'Tỷ lệ Hao hụt Nông sản & Thực phẩm tươi sống (Spoilage Allowance)',
    content: 'Đối với ngành hàng nông sản / rau củ quả tươi sống, áp dụng tỷ lệ hao hụt mặc định 4.5% - 6.0% trên giá vốn mua vào (COGS spoilage allowance) vào tính toán lãi gộp.',
    category: 'Retail-Agri',
    tags: ['agri', 'spoilage', 'cogs', 'retail'],
    sourceSessionId: 'enterprise-seed',
    confidence: 1.0,
    isPinned: false,
    isEnabled: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: '019183ab-0004-7000-8000-000000000004',
    type: 'rule',
    title: 'Quy tắc Đóng góp Kênh Bán Lẻ Đa kênh (Omnichannel CM1)',
    content: 'Contribution Margin 1 (CM1) của kênh TMĐT (Shopee, TikTok Shop) = Doanh Thu Thuần Kênh - COGS - Phí Sàn (8% - 12.5%) - Chi phí Vận chuyển trợ giá. Kênh có CM1 < 15% cần phát tín hiệu cảnh báo tối ưu khuyến mãi.',
    category: 'Omnichannel',
    tags: ['omnichannel', 'cm1', 'ecommerce', 'retail'],
    sourceSessionId: 'enterprise-seed',
    confidence: 1.0,
    isPinned: false,
    isEnabled: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: '019183ab-0005-7000-8000-000000000005',
    type: 'preference',
    title: 'Định dạng Báo cáo Tài chính Lãnh đạo',
    content: 'Luôn hiển thị số liệu tài chính kèm đơn vị tiền tệ rõ ràng (VNĐ hoặc Tỷ VNĐ), làm tròn 2 chữ số thập phân cho tỷ lệ %, kèm giải trình nguyên nhân biến động vượt quá ±10%.',
    category: 'Reporting',
    tags: ['reporting', 'format', 'executive', 'currency'],
    sourceSessionId: 'enterprise-seed',
    confidence: 1.0,
    isPinned: false,
    isEnabled: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

// ── Persistence Helper Functions ──

/**
 * Read all persistent global memories from partitioned storage.
 * Automatically seeds defaults if partition is empty.
 */
export function getGlobalMemories(): AgentMemoryCard[] {
  try {
    const raw = storageManager.getPartitionedItem<AgentMemoryCard[]>(
      GLOBAL_MEMORY_STORAGE_TYPE,
      GLOBAL_SESSION_ID
    );

    if (Array.isArray(raw) && raw.length > 0) {
      return raw;
    }

    // Seed defaults on initial load
    saveGlobalMemories(DEFAULT_ENTERPRISE_MEMORY_CARDS);
    return [...DEFAULT_ENTERPRISE_MEMORY_CARDS];
  } catch (err) {
    console.warn('[globalMemoryStore] Failed to read memories, returning defaults:', err);
    return [...DEFAULT_ENTERPRISE_MEMORY_CARDS];
  }
}

/**
 * Save the entire list of global memory cards into partitioned storage.
 */
export function saveGlobalMemories(memories: AgentMemoryCard[]): boolean {
  try {
    return storageManager.setPartitionedItem<AgentMemoryCard[]>(
      GLOBAL_MEMORY_STORAGE_TYPE,
      memories,
      GLOBAL_SESSION_ID
    );
  } catch (err) {
    console.error('[globalMemoryStore] Failed to save memories:', err);
    return false;
  }
}

/**
 * Add a new memory card to persistent global storage.
 */
export function addGlobalMemory(
  card: Omit<AgentMemoryCard, 'id' | 'createdAt' | 'updatedAt'> &
    Partial<Pick<AgentMemoryCard, 'id' | 'createdAt' | 'updatedAt'>>
): AgentMemoryCard {
  const now = new Date().toISOString();
  const newCard: AgentMemoryCard = {
    id: card.id && isValidUUIDv7(card.id) ? card.id : generateUUIDv7(),
    type: card.type || 'rule',
    title: String(card.title || 'Quy tắc chưa đặt tên').trim(),
    content: String(card.content || '').trim(),
    category: String(card.category || 'General').trim(),
    tags: Array.isArray(card.tags) ? card.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    sourceSessionId: card.sourceSessionId || 'manual',
    sourceMessageId: card.sourceMessageId,
    confidence: typeof card.confidence === 'number' ? card.confidence : 1.0,
    isPinned: Boolean(card.isPinned),
    isEnabled: card.isEnabled !== false,
    createdAt: card.createdAt || now,
    updatedAt: card.updatedAt || now,
  };

  const existing = getGlobalMemories();
  const updated = [newCard, ...existing];
  saveGlobalMemories(updated);
  return newCard;
}

/**
 * Update an existing memory card in persistent global storage.
 */
export function updateGlobalMemory(
  id: string,
  updates: Partial<Omit<AgentMemoryCard, 'id' | 'createdAt'>>
): AgentMemoryCard | null {
  const existing = getGlobalMemories();
  const idx = existing.findIndex((m) => m.id === id);
  if (idx === -1) return null;

  const current = existing[idx];
  const updatedCard: AgentMemoryCard = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  existing[idx] = updatedCard;
  saveGlobalMemories(existing);
  return updatedCard;
}

/**
 * Delete a memory card from persistent global storage.
 */
export function deleteGlobalMemory(id: string): boolean {
  const existing = getGlobalMemories();
  const filtered = existing.filter((m) => m.id !== id);
  if (filtered.length === existing.length) return false;

  saveGlobalMemories(filtered);
  return true;
}

/**
 * Toggle enable/disable status for a memory card.
 */
export function toggleGlobalMemory(id: string, isEnabled?: boolean): AgentMemoryCard | null {
  const existing = getGlobalMemories();
  const card = existing.find((m) => m.id === id);
  if (!card) return null;

  const nextState = isEnabled !== undefined ? isEnabled : !card.isEnabled;
  return updateGlobalMemory(id, { isEnabled: nextState });
}

/**
 * Toggle pin status for a memory card.
 */
export function togglePinGlobalMemory(id: string, isPinned?: boolean): AgentMemoryCard | null {
  const existing = getGlobalMemories();
  const card = existing.find((m) => m.id === id);
  if (!card) return null;

  const nextState = isPinned !== undefined ? isPinned : !card.isPinned;
  return updateGlobalMemory(id, { isPinned: nextState });
}

/**
 * Reset memory cards back to the default enterprise seeds.
 */
export function resetGlobalMemoriesToDefault(): AgentMemoryCard[] {
  const defaults = [...DEFAULT_ENTERPRISE_MEMORY_CARDS];
  saveGlobalMemories(defaults);
  return defaults;
}

// ── JSON Export / Import ──

export function exportMemoriesToJson(memories?: AgentMemoryCard[]): string {
  const cardsToExport = memories || getGlobalMemories();
  const exportPayload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    count: cardsToExport.length,
    memories: cardsToExport,
  };
  return JSON.stringify(exportPayload, null, 2);
}

export function importMemoriesFromJson(jsonString: string): {
  importedCount: number;
  errors: string[];
  memories: AgentMemoryCard[];
} {
  const errors: string[] = [];
  if (!jsonString || typeof jsonString !== 'string') {
    return { importedCount: 0, errors: ['Chuỗi JSON không hợp lệ hoặc rỗng.'], memories: getGlobalMemories() };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return {
      importedCount: 0,
      errors: [`Lỗi cú pháp JSON: ${err instanceof Error ? err.message : String(err)}`],
      memories: getGlobalMemories(),
    };
  }

  const rawList: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.memories)
    ? parsed.memories
    : [];

  if (rawList.length === 0) {
    return {
      importedCount: 0,
      errors: ['Không tìm thấy thẻ tri thức nào trong tệp JSON nhập vào.'],
      memories: getGlobalMemories(),
    };
  }

  const currentMemories = getGlobalMemories();
  const existingIds = new Set(currentMemories.map((m) => m.id));
  const validNewCards: AgentMemoryCard[] = [];
  const now = new Date().toISOString();

  rawList.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`Mục thứ #${index + 1} không phải là đối tượng hợp lệ.`);
      return;
    }

    const title = String(item.title || '').trim();
    const content = String(item.content || '').trim();
    if (!title || !content) {
      errors.push(`Mục thứ #${index + 1} thiếu tiêu đề hoặc nội dung quy tắc.`);
      return;
    }

    const validTypes: MemoryCardType[] = ['rule', 'formula', 'preference', 'assumption'];
    const type: MemoryCardType = validTypes.includes(item.type) ? item.type : 'rule';

    let id = typeof item.id === 'string' && isValidUUIDv7(item.id) ? item.id : generateUUIDv7();
    // If ID collides with existing, regenerate a fresh UUIDv7
    if (existingIds.has(id)) {
      id = generateUUIDv7();
    }
    existingIds.add(id);

    const card: AgentMemoryCard = {
      id,
      type,
      title,
      content,
      category: String(item.category || 'General').trim(),
      tags: Array.isArray(item.tags) ? item.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
      sourceSessionId: item.sourceSessionId || 'import-json',
      sourceMessageId: item.sourceMessageId,
      confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 1.0,
      isPinned: Boolean(item.isPinned),
      isEnabled: item.isEnabled !== false,
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now,
    };

    validNewCards.push(card);
  });

  const merged = [...validNewCards, ...currentMemories];
  saveGlobalMemories(merged);

  return {
    importedCount: validNewCards.length,
    errors,
    memories: merged,
  };
}

// ── System Prompt Injection Formatter ──

/**
 * Format enabled global memory cards into a concise, authoritative context block
 * for injection into LLM system prompts.
 * Prioritizes pinned cards and groups logically by category type.
 */
export function formatMemoriesForSystemPrompt(memories: AgentMemoryCard[]): string {
  if (!Array.isArray(memories) || memories.length === 0) return '';

  const activeMemories = memories.filter((m) => m.isEnabled !== false);
  if (activeMemories.length === 0) return '';

  // Sort: pinned first, then newest
  const sorted = [...activeMemories].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const categorized: Record<MemoryCardType, AgentMemoryCard[]> = {
    formula: [],
    rule: [],
    assumption: [],
    preference: [],
  };

  sorted.forEach((m) => {
    if (categorized[m.type]) {
      categorized[m.type].push(m);
    } else {
      categorized.rule.push(m);
    }
  });

  let prompt = '\n\nGLOBAL AGENT MEMORY & BUSINESS KNOWLEDGE BASE (Persistent across all sessions):\n';
  prompt += 'You MUST strictly adhere to the following business formulas, operational accounting rules, and assumptions in all calculations, SQL queries, and artifact generation:\n';

  if (categorized.formula.length > 0) {
    prompt += '\n[MANDATORY FORMULAS]:\n';
    categorized.formula.forEach((f) => {
      const pinMark = f.isPinned ? ' [AUTHORITATIVE]' : '';
      prompt += `- ${f.title}${pinMark}: ${f.content}\n`;
    });
  }

  if (categorized.rule.length > 0) {
    prompt += '\n[OPERATIONAL & ACCOUNTING RULES]:\n';
    categorized.rule.forEach((r) => {
      const pinMark = r.isPinned ? ' [AUTHORITATIVE]' : '';
      prompt += `- ${r.title}${pinMark}: ${r.content}\n`;
    });
  }

  if (categorized.assumption.length > 0) {
    prompt += '\n[BUSINESS ASSUMPTIONS & BENCHMARKS]:\n';
    categorized.assumption.forEach((a) => {
      const pinMark = a.isPinned ? ' [AUTHORITATIVE]' : '';
      prompt += `- ${a.title}${pinMark}: ${a.content}\n`;
    });
  }

  if (categorized.preference.length > 0) {
    prompt += '\n[EXECUTIVE PREFERENCES & REPORTING CONSTRAINTS]:\n';
    categorized.preference.forEach((p) => {
      const pinMark = p.isPinned ? ' [AUTHORITATIVE]' : '';
      prompt += `- ${p.title}${pinMark}: ${p.content}\n`;
    });
  }

  prompt += '\nTreat these corporate rules as ground truth. Never hallucinate conflicting arithmetic or bypass these business standards.';
  return prompt;
}

// ── Auto-Extraction Parser ──

/**
 * Parse text stream or completed assistant response to auto-extract structured memory cards.
 * Supports:
 * 1. XML-style `<memory_card type="..." title="..." category="..." tags="...">content</memory_card>`
 * 2. Markdown blocks `[GHI NHỚ QUY TẮC]: <Title> = <Content>`
 */
export function extractMemoryCardsFromText(text: string, sourceSessionId?: string): AgentMemoryCard[] {
  if (!text || typeof text !== 'string') return [];

  const extractedCards: AgentMemoryCard[] = [];
  const now = new Date().toISOString();

  // 1. Match XML tags: <memory_card ...>...</memory_card>
  const xmlRegex = /<memory_card(?:\s+type=["']([^"']+)["'])?(?:\s+title=["']([^"']+)["'])?(?:\s+category=["']([^"']+)["'])?(?:\s+tags=["']([^"']+)["'])?>([\s\S]*?)<\/memory_card>/gi;
  let xmlMatch: RegExpExecArray | null;

  while ((xmlMatch = xmlRegex.exec(text)) !== null) {
    const rawType = (xmlMatch[1] || 'rule').toLowerCase();
    const rawTitle = (xmlMatch[2] || 'Quy tắc trích xuất').trim();
    const rawCategory = (xmlMatch[3] || 'Auto-Extracted').trim();
    const rawTags = (xmlMatch[4] || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const content = (xmlMatch[5] || '').trim();

    const validTypes: MemoryCardType[] = ['rule', 'formula', 'preference', 'assumption'];
    const type: MemoryCardType = validTypes.includes(rawType as MemoryCardType)
      ? (rawType as MemoryCardType)
      : 'rule';

    if (content) {
      extractedCards.push({
        id: generateUUIDv7(),
        type,
        title: rawTitle,
        content,
        category: rawCategory,
        tags: rawTags.length > 0 ? rawTags : ['auto-extracted'],
        sourceSessionId: sourceSessionId || 'stream-extraction',
        confidence: 0.95,
        isPinned: false,
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // 2. Match Heuristic patterns: [GHI NHỚ QUY TẮC / CÔNG THỨC / GIẢ ĐỊNH]: <Title> =|-|: <Content>
  const heuristicRegex = /\[([^\]]*(?:GHI NHỚ|MEMORY CARD|QUY TẮC|CÔNG THỨC|GIẢ ĐỊNH|SỞ THÍCH|FORMULA|RULE|ASSUMPTION|PREFERENCE)[^\]]*)\](?::|\s*-)?\s*([^=\-\n\r:]+?)\s*(?:=|-|:)\s*([^\n\r]+)/gi;
  let hMatch: RegExpExecArray | null;

  while ((hMatch = heuristicRegex.exec(text)) !== null) {
    const rawKind = (hMatch[1] || '').toLowerCase();
    const rawTitle = (hMatch[2] || 'Tri thức ghi nhớ').trim();
    const content = (hMatch[3] || '').trim();

    let type: MemoryCardType = 'rule';
    if (rawKind.includes('công thức') || rawKind.includes('formula')) type = 'formula';
    else if (rawKind.includes('giả định') || rawKind.includes('assumption')) type = 'assumption';
    else if (rawKind.includes('sở thích') || rawKind.includes('preference')) type = 'preference';

    if (content && !extractedCards.some((c) => c.title === rawTitle && c.content === content)) {
      extractedCards.push({
        id: generateUUIDv7(),
        type,
        title: rawTitle,
        content,
        category: 'Auto-Extracted',
        tags: ['heuristic', type],
        sourceSessionId: sourceSessionId || 'stream-extraction',
        confidence: 0.88,
        isPinned: false,
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return extractedCards;
}
