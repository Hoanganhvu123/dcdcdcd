import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ============================================================================
// LOGIC REPLICATORS FROM useOpenWorkStore & SlideArtifactViewer
// ============================================================================

export function parsePartialJson(raw) {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    let repaired = trimmed;
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }
    const stack = [];
    let inString = false;
    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (char === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
        inString = !inString;
      } else if (!inString) {
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === char) {
            stack.pop();
          }
        }
      }
    }
    while (stack.length > 0) {
      repaired += stack.pop();
    }
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

export function resolveToolMeta(toolName) {
  const lower = (toolName || '').toLowerCase();
  if (lower.includes('presentation') || lower.includes('slide') || lower.includes('deck') || lower.includes('pptx')) {
    return { tab: 'slide', extension: '.pptx', defaultName: 'presentation.pptx', defaultTitle: 'Bài Thuyết Trình Slide (16:9)' };
  }
  if (lower.includes('spreadsheet') || lower.includes('excel') || lower.includes('sheet') || lower.includes('pnl')) {
    return { tab: 'excel', extension: '.xlsx', defaultName: 'spreadsheet.xlsx', defaultTitle: 'Bảng Tính Excel' };
  }
  if (lower.includes('doc') || lower.includes('word') || lower.includes('report') || lower.includes('summary')) {
    return { tab: 'docx', extension: '.docx', defaultName: 'document.docx', defaultTitle: 'Tài Liệu Báo Cáo DOCX' };
  }
  return { tab: 'code', extension: '.py', defaultName: 'pipeline.py', defaultTitle: 'Mã Nguồn Thực Thi' };
}

function normalizeSlideData(artifact) {
  if (!artifact) return [];
  let rawList = null;

  if (Array.isArray(artifact.slides) && artifact.slides.length > 0) {
    rawList = artifact.slides;
  } else if (Array.isArray(artifact.content) && artifact.content.length > 0) {
    rawList = artifact.content;
  } else if (artifact.content && typeof artifact.content === 'object') {
    if (Array.isArray(artifact.content.slides) && artifact.content.slides.length > 0) {
      rawList = artifact.content.slides;
    } else if (Array.isArray(artifact.content.deckData) && artifact.content.deckData.length > 0) {
      rawList = artifact.content.deckData;
    } else if (Array.isArray(artifact.content.deck_data?.slides) && artifact.content.deck_data.slides.length > 0) {
      rawList = artifact.content.deck_data.slides;
    } else if (artifact.content.title || artifact.content.layout) {
      rawList = [artifact.content];
    }
  } else if (typeof artifact.content === 'string') {
    try {
      const parsed = JSON.parse(artifact.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        rawList = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
          rawList = parsed.slides;
        } else if (Array.isArray(parsed.deckData) && parsed.deckData.length > 0) {
          rawList = parsed.deckData;
        } else if (parsed.title || parsed.layout) {
          rawList = [parsed];
        }
      }
    } catch {}
  }

  if (!rawList || rawList.length === 0) {
    return [];
  }

  return rawList.map((item, idx) => {
    if (typeof item !== 'object' || !item) {
      return {
        layout: 'bullets',
        title: `Slide ${idx + 1}`,
        bullets: [String(item)],
      };
    }
    const stats =
      item.stats ||
      (Array.isArray(item.kpis)
        ? item.kpis.map((k) => ({
            label: k.label || '',
            value: k.value || '',
            trend: k.trend,
          }))
        : undefined);

    let layout = item.layout;
    if (!layout) {
      if (idx === 0 && (item.subtitle || item.date) && !item.bullets && !item.stats && !item.kpis) {
        layout = 'hero';
      } else if (stats && stats.length > 0) {
        layout = 'stat_grid';
      } else if (item.left_bullets && item.right_bullets) {
        layout = 'two_col';
      } else if (item.steps && item.steps.length > 0) {
        layout = 'timeline';
      } else if (item.quote) {
        layout = 'quote';
      } else if (item.cta || item.contact_info) {
        layout = 'closing';
      } else if (item.number) {
        layout = 'big_number';
      } else if (item.items && item.items.length > 0) {
        layout = 'bento_grid';
      } else {
        layout = 'bullets';
      }
    }

    return {
      ...item,
      layout,
      title: item.title || `Slide ${idx + 1}`,
      stats,
    };
  });
}

function evaluateViewerRender(artifact, spotlightActive) {
  const slides = normalizeSlideData(artifact);
  const totalSlides = slides.length;
  const isGenerating =
    artifact?.status === 'generating' ||
    (spotlightActive && (!artifact || totalSlides === 0));

  if (isGenerating) {
    return {
      rendered: 'SlideSkeleton',
      dataTestId: 'spotlight-loading-skeleton',
      toolName: artifact?.toolName || 'presentation_builder',
      layout: slides[0]?.layout || artifact?.content?.layout || 'hero',
      title: artifact?.title || artifact?.name,
    };
  }

  if (totalSlides === 0) {
    return {
      rendered: 'EmptyState',
      totalSlides: 0,
    };
  }

  return {
    rendered: 'SlideRenderer',
    totalSlides,
    slides,
  };
}

// Exact replica of current useOpenWorkStore implementation logic
class ActualUseOpenWorkStoreState {
  constructor() {
    this.streamParts = [];
    this.isStreaming = false;
    this.spotlightActive = false;
    this.artifacts = [];
    this.activeTab = 'slide';
    this.activeArtifactId = '';
    this.workbenchOpen = true;
  }

  sendMessage(prompt) {
    this.isStreaming = true;
    this.streamParts.push({ type: 'user', id: 'u1', text: prompt });
  }

  onToolCallDelta(toolCall) {
    this.spotlightActive = true;
    const meta = resolveToolMeta(toolCall.name);
    const parsedContent = parsePartialJson(toolCall.accumulatedArguments);

    const artId = toolCall.id || `art-${meta.tab}-${toolCall.index || 0}`;
    const currentTitle = parsedContent?.title || meta.defaultTitle;
    const currentName = parsedContent?.title
      ? `${String(parsedContent.title).replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1EA0-\u1EF9]/g, '_')}${meta.extension}`
      : meta.defaultName;

    const idx = this.artifacts.findIndex((a) => a.id === artId || a.type === meta.tab);
    const generatingArtifact = {
      id: artId,
      name: currentName,
      title: currentTitle,
      type: meta.tab,
      extension: meta.extension,
      status: 'generating',
      version: idx >= 0 ? this.artifacts[idx].version : 1,
      content: parsedContent || (idx >= 0 ? this.artifacts[idx].content : {}),
      updatedAt: 'Đang tạo...',
    };

    if (idx >= 0) {
      this.artifacts[idx] = generatingArtifact;
    } else {
      this.artifacts.push(generatingArtifact);
    }

    this.activeTab = meta.tab;
    this.workbenchOpen = true;
    this.activeArtifactId = artId;

    const capId = `cap-${toolCall.id || toolCall.index || 0}`;
    const capIdx = this.streamParts.findIndex((p) => p.id === capId);
    if (capIdx >= 0) {
      this.streamParts[capIdx].codeSnippet = toolCall.accumulatedArguments;
      this.streamParts[capIdx].status = 'running';
    } else {
      this.streamParts.push({
        type: 'capability-call',
        id: capId,
        toolName: toolCall.name || 'tool_execution',
        displayName: toolCall.name || 'Tool Execution',
        status: 'running',
        startTime: Date.now(),
        codeSnippet: toolCall.accumulatedArguments,
      });
    }
  }

  onFinish(result) {
    if (result && Array.isArray(result.toolCalls) && result.toolCalls.length > 0) {
      for (const tc of result.toolCalls) {
        const toolName = tc.function?.name || tc.name;
        const meta = resolveToolMeta(toolName);
        let parsedArgs = null;
        try {
          parsedArgs = JSON.parse(tc.function?.arguments || '{}');
        } catch {
          parsedArgs = parsePartialJson(tc.function?.arguments || '') || {};
        }

        const artId = tc.id || `art-${meta.tab}-${tc.index ?? 0}`;
        const finalTitle = parsedArgs?.title || meta.defaultTitle;
        const finalName = parsedArgs?.title
          ? `${String(parsedArgs.title).replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1EA0-\u1EF9]/g, '_')}${meta.extension}`
          : meta.defaultName;

        const idx = this.artifacts.findIndex((a) => a.id === artId || a.type === meta.tab);
        const readyArtifact = {
          id: artId,
          name: finalName,
          title: finalTitle,
          type: meta.tab,
          extension: meta.extension,
          status: 'ready',
          version: idx >= 0 ? this.artifacts[idx].version + 1 : 1,
          content: parsedArgs,
          updatedAt: 'Vừa xong',
        };

        if (idx >= 0) {
          this.artifacts[idx] = readyArtifact;
        } else {
          this.artifacts.push(readyArtifact);
        }

        this.activeTab = meta.tab;
        this.activeArtifactId = artId;
      }
    }

    this.streamParts = this.streamParts.map((p) => {
      if (p.type === 'reasoning' && p.isStreaming) {
        return { ...p, isStreaming: false, title: 'Thought' };
      }
      if (p.type === 'capability-call' && p.status === 'running') {
        return { ...p, status: 'success' };
      }
      return p;
    });
    this.spotlightActive = false;
    this.isStreaming = false;
  }

  // Exact code from useOpenWorkStore.ts:301
  abortStream() {
    this.spotlightActive = false;
    this.isStreaming = false;
    this.streamParts = this.streamParts.map((p) =>
      p.type === 'reasoning' && p.isStreaming ? { ...p, isStreaming: false, title: 'Thought' } : p
    );
  }

  // Exact code from useOpenWorkStore.ts:551
  onError(err) {
    this.spotlightActive = false;
    this.streamParts = this.streamParts.map((p) =>
      p.type === 'reasoning' && p.isStreaming ? { ...p, isStreaming: false, title: 'Thought' } : p
    );
    this.streamParts.push({
      type: 'text',
      id: `err-${Date.now()}`,
      title: 'Lỗi Kết Nối DeepSeek API',
      markdown: `⚠️ **Không thể hoàn thành yêu cầu:** ${err.message}`,
    });
    this.isStreaming = false;
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

test('🔥 CHALLENGER 2: ADVERSARIAL STRESS TEST SUITE ON SPOTLIGHT & SKELETON (M3)', async (t) => {

  // --------------------------------------------------------------------------
  // SCENARIO 1: Immediate Tool Call Without Reasoning
  // --------------------------------------------------------------------------
  await t.test('Scenario 1: Immediate Tool Call Without Reasoning', async (st) => {
    await st.test('S1.1: Instant chunk 1 tool call activates spotlight and renders SlideSkeleton immediately', () => {
      const store = new ActualUseOpenWorkStoreState();
      store.sendMessage('Immediate presentation request');
      assert.equal(store.isStreaming, true);
      assert.equal(store.spotlightActive, false);

      // Tool call delta arrives on chunk 1
      store.onToolCallDelta({
        id: 'call-imm-1',
        name: 'presentation_builder',
        index: 0,
        accumulatedArguments: '{"title": "Immediate Presentation", "slides": [',
      });

      assert.equal(store.spotlightActive, true);
      assert.equal(store.activeTab, 'slide');

      const slideArt = store.artifacts.find((a) => a.type === 'slide');
      assert.ok(slideArt);
      assert.equal(slideArt.status, 'generating');

      const render = evaluateViewerRender(slideArt, store.spotlightActive);
      assert.equal(render.rendered, 'SlideSkeleton');
      assert.equal(render.dataTestId, 'spotlight-loading-skeleton');
    });

    await st.test('S1.2: Immediate tool call completes and transitions smoothly to SlideRenderer', () => {
      const store = new ActualUseOpenWorkStoreState();
      store.sendMessage('Immediate presentation');
      store.onToolCallDelta({
        id: 'call-imm-2',
        name: 'presentation_builder',
        accumulatedArguments: '{"title": "Instant Deck", "slides": [{"layout": "hero", "title": "Done"}]}',
      });

      store.onFinish({
        toolCalls: [
          {
            id: 'call-imm-2',
            function: {
              name: 'presentation_builder',
              arguments: '{"title": "Instant Deck", "slides": [{"layout": "hero", "title": "Done"}]}',
            },
          },
        ],
      });

      assert.equal(store.spotlightActive, false);
      assert.equal(store.isStreaming, false);

      const slideArt = store.artifacts.find((a) => a.type === 'slide');
      assert.equal(slideArt.status, 'ready');

      const render = evaluateViewerRender(slideArt, store.spotlightActive);
      assert.equal(render.rendered, 'SlideRenderer');
      assert.equal(render.totalSlides, 1);
    });
  });

  // --------------------------------------------------------------------------
  // SCENARIO 2: Stream Abort Mid-Stream & Error Paths
  // --------------------------------------------------------------------------
  await t.test('Scenario 2: Stream Abort Mid-Stream & Error Paths', async (st) => {
    await st.test('S2.1: EMPIRICAL FINDING: abortStream leaves CapabilityCallPart in running state and Artifact in generating status', () => {
      const store = new ActualUseOpenWorkStoreState();
      store.sendMessage('Generate deck');
      store.onToolCallDelta({
        id: 'call-abort-1',
        name: 'presentation_builder',
        accumulatedArguments: '{"title": "Interrupted Deck", "slides": [',
      });

      assert.equal(store.spotlightActive, true);
      const capPartBefore = store.streamParts.find((p) => p.type === 'capability-call');
      assert.equal(capPartBefore.status, 'running');

      // Execute abort
      store.abortStream();

      // Spotlight boolean resets
      assert.equal(store.spotlightActive, false);
      assert.equal(store.isStreaming, false);

      // BUT: observe the state gap in current useOpenWorkStore implementation:
      const capPartAfter = store.streamParts.find((p) => p.type === 'capability-call');
      const slideArtAfter = store.artifacts.find((a) => a.type === 'slide');

      // VULNERABILITY CONFIRMED: capPartAfter.status is still 'running' because abortStream only maps 'reasoning'
      assert.equal(capPartAfter.status, 'running', 'Observed: CapabilityCallPart status remains running after abort');
      
      // VULNERABILITY CONFIRMED: slideArtAfter.status is still 'generating'
      assert.equal(slideArtAfter.status, 'generating', 'Observed: Artifact status remains generating after abort');

      // Consequently, SlideArtifactViewer continues to render SlideSkeleton because artifact.status === "generating"
      const render = evaluateViewerRender(slideArtAfter, store.spotlightActive);
      assert.equal(render.rendered, 'SlideSkeleton', 'Observed: SlideArtifactViewer trapped in SlideSkeleton because artifact.status was not reset from generating');
    });

    await st.test('S2.2: EMPIRICAL FINDING: onError also leaves CapabilityCallPart in running and Artifact in generating status', () => {
      const store = new ActualUseOpenWorkStoreState();
      store.sendMessage('Generate deck error path');
      store.onToolCallDelta({
        id: 'call-err-1',
        name: 'presentation_builder',
        accumulatedArguments: '{"title": "Failing Deck", "slides": [',
      });

      store.onError(new Error('Network disconnected'));

      assert.equal(store.spotlightActive, false);
      assert.equal(store.isStreaming, false);

      const capPart = store.streamParts.find((p) => p.type === 'capability-call');
      const slideArt = store.artifacts.find((a) => a.type === 'slide');

      // VULNERABILITY CONFIRMED: onError also fails to clean up running capability call & generating artifact
      assert.equal(capPart.status, 'running');
      assert.equal(slideArt.status, 'generating');
    });
  });

  // --------------------------------------------------------------------------
  // SCENARIO 3: Malformed / Truncated Tool Call Arguments During Streaming
  // --------------------------------------------------------------------------
  await t.test('Scenario 3: Malformed / Truncated Tool Call Arguments During Streaming', async (st) => {
    await st.test('S3.1: parsePartialJson parses incremental valid structures and gracefully returns null on incomplete keys without throwing', () => {
      assert.deepEqual(parsePartialJson('{"title": "Q3 Rev'), { title: 'Q3 Rev' });
      assert.deepEqual(parsePartialJson('{"title": "Q3 Rev", "slides": ['), { title: 'Q3 Rev', slides: [] });
      assert.deepEqual(parsePartialJson('{"title": "Q3 Rev", "slides": [{"title": "Slide 1", "layout": "hero"}'), {
        title: 'Q3 Rev',
        slides: [{ title: 'Slide 1', layout: 'hero' }],
      });

      // When a key lacks a value (e.g. {"label": "ARR", "val ), it safely returns null without throwing uncaught error
      const brokenKeyResult = parsePartialJson('{"stats": [{"label": "ARR", "val');
      assert.equal(brokenKeyResult, null, 'Must safely return null without throwing exception');
    });

    await st.test('S3.2: parsePartialJson immunity to corrupt syntax and invalid inputs', () => {
      assert.equal(parsePartialJson(''), null);
      assert.equal(parsePartialJson('   '), null);
      assert.equal(parsePartialJson(null), null);
      assert.equal(parsePartialJson(undefined), null);
      assert.equal(parsePartialJson('<<<NOT_JSON>>>'), null);
      assert.equal(parsePartialJson('{broken: [,,,}'), null);
      assert.equal(parsePartialJson('}{}{'), null);
    });

    await st.test('S3.3: Stream abruptly finishing with malformed JSON recovers safely in onFinish', () => {
      const store = new ActualUseOpenWorkStoreState();
      store.sendMessage('Corrupted end');
      store.onToolCallDelta({
        id: 'c-corrupt',
        name: 'presentation_builder',
        accumulatedArguments: '{"title": "Truncated',
      });
      assert.equal(store.spotlightActive, true);

      // onFinish receives truncated JSON
      store.onFinish({
        toolCalls: [
          {
            id: 'c-corrupt',
            function: {
              name: 'presentation_builder',
              arguments: '{"title": "Truncated',
            },
          },
        ],
      });

      assert.equal(store.spotlightActive, false, 'spotlightActive resets');
      assert.equal(store.isStreaming, false);
      const art = store.artifacts.find((a) => a.type === 'slide');
      assert.ok(art);
      assert.equal(art.status, 'ready');
      assert.deepEqual(art.content, { title: 'Truncated' });
    });
  });

  // --------------------------------------------------------------------------
  // SCENARIO 4: Tab Switching Between Slide and Excel During Active Spotlight
  // --------------------------------------------------------------------------
  await t.test('Scenario 4: Tab Switching Between Slide and Excel During Active Spotlight', async (st) => {
    await st.test('S4.1: Switching active tab from slide to excel preserves spotlight state and artifact data', () => {
      const store = new ActualUseOpenWorkStoreState();
      store.sendMessage('Generate slide presentation');
      store.onToolCallDelta({
        id: 'call-slide-1',
        name: 'presentation_builder',
        accumulatedArguments: '{"title": "Executive Summary", "slides": [{"layout": "hero", "title": "Summary"}]}',
      });

      assert.equal(store.activeTab, 'slide');
      assert.equal(store.spotlightActive, true);

      // User switches to Excel tab
      store.activeTab = 'excel';
      assert.equal(store.activeTab, 'excel');
      assert.equal(store.spotlightActive, true, 'spotlightActive remains true during session');

      const slideArtGenerating = store.artifacts.find((a) => a.type === 'slide');
      assert.equal(slideArtGenerating.status, 'generating');

      // User switches back to slide tab
      store.activeTab = 'slide';
      assert.equal(store.activeTab, 'slide');

      // Stream completes
      store.onFinish({
        toolCalls: [
          {
            id: 'call-slide-1',
            function: {
              name: 'presentation_builder',
              arguments: '{"title": "Executive Summary", "slides": [{"layout": "hero", "title": "Summary"}]}',
            },
          },
        ],
      });

      assert.equal(store.spotlightActive, false);
      const freshSlideArt = store.artifacts.find((a) => a.type === 'slide');
      assert.equal(freshSlideArt.status, 'ready');

      const render = evaluateViewerRender(freshSlideArt, store.spotlightActive);
      assert.equal(render.rendered, 'SlideRenderer');
      assert.equal(render.totalSlides, 1);
    });

    await st.test('S4.2: Sequential multi-tool execution across excel and slide tabs', () => {
      const store = new ActualUseOpenWorkStoreState();
      store.sendMessage('Run multi-tool analysis');

      // 1. Excel tool streams
      store.onToolCallDelta({
        id: 'call-excel-1',
        name: 'spreadsheet_studio',
        accumulatedArguments: '{"title": "Financial Model"}',
      });
      assert.equal(store.activeTab, 'excel');
      assert.equal(store.spotlightActive, true);

      // 2. Slide tool streams next
      store.onToolCallDelta({
        id: 'call-slide-2',
        name: 'presentation_builder',
        accumulatedArguments: '{"title": "Pitch Deck", "slides": [{"layout": "hero", "title": "Deck"}]}',
      });
      assert.equal(store.activeTab, 'slide');
      assert.equal(store.spotlightActive, true);

      // 3. Finish stream with both tool calls
      store.onFinish({
        toolCalls: [
          {
            id: 'call-excel-1',
            function: { name: 'spreadsheet_studio', arguments: '{"title": "Financial Model"}' },
          },
          {
            id: 'call-slide-2',
            function: { name: 'presentation_builder', arguments: '{"title": "Pitch Deck", "slides": [{"layout": "hero", "title": "Deck"}]}' },
          },
        ],
      });

      assert.equal(store.spotlightActive, false);
      const freshExcel = store.artifacts.find((a) => a.type === 'excel');
      const freshSlide = store.artifacts.find((a) => a.type === 'slide');
      assert.equal(freshExcel.status, 'ready');
      assert.equal(freshSlide.status, 'ready');
    });
  });

  // --------------------------------------------------------------------------
  // SCENARIO 5: High-load Fuzzing Stress
  // --------------------------------------------------------------------------
  await t.test('Scenario 5: High-load Fuzzing Stress', async (st) => {
    await st.test('S5.1: 300 rapid chunk deltas processes cleanly without throwing', () => {
      const store = new ActualUseOpenWorkStoreState();
      store.sendMessage('Rapid streaming');

      const start = Date.now();
      let acc = '{"title": "Big Deck", "slides": [';
      for (let i = 0; i < 300; i++) {
        acc += `{"layout": "hero", "title": "Slide ${i}"},`;
        store.onToolCallDelta({
          id: 'call-fuzz',
          name: 'presentation_builder',
          accumulatedArguments: acc,
        });
      }

      assert.equal(store.spotlightActive, true);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 2000);

      store.onFinish({
        toolCalls: [
          {
            id: 'call-fuzz',
            function: {
              name: 'presentation_builder',
              arguments: '{"title": "Big Deck", "slides": [{"layout": "hero", "title": "Slide 0"}]}',
            },
          },
        ],
      });

      assert.equal(store.spotlightActive, false);
    });
  });
});
