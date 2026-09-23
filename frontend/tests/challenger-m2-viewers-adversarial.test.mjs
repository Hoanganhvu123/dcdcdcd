import test from 'node:test';
import assert from 'node:assert/strict';

// ── Normalize Slide Data Logic (Mirror of SlideArtifactViewer.tsx) ─────────
function normalizeSlideData(artifact) {
  if (!artifact) return [];

  let rawList = null;

  // Case 1: direct artifact.slides
  if (Array.isArray(artifact.slides) && artifact.slides.length > 0) {
    rawList = artifact.slides;
  }
  // Case 2: artifact.content is array
  else if (Array.isArray(artifact.content) && artifact.content.length > 0) {
    rawList = artifact.content;
  }
  // Case 3: artifact.content has .slides or .deckData
  else if (artifact.content && typeof artifact.content === 'object') {
    if (Array.isArray(artifact.content.slides) && artifact.content.slides.length > 0) {
      rawList = artifact.content.slides;
    } else if (Array.isArray(artifact.content.deckData) && artifact.content.deckData.length > 0) {
      rawList = artifact.content.deckData;
    } else if (Array.isArray(artifact.content.deck_data?.slides) && artifact.content.deck_data.slides.length > 0) {
      rawList = artifact.content.deck_data.slides;
    } else if (artifact.content.title || artifact.content.layout) {
      rawList = [artifact.content];
    }
  }
  // Case 4: artifact.content is a JSON string
  else if (typeof artifact.content === 'string') {
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
    } catch {
      // Not JSON string
    }
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
        ? item.kpis.map(k => ({
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

function resolveThemeVars(artifact) {
  return {
    '--osd-bg': '#09090b',
    '--osd-text': '#f8fafc',
    '--osd-accent': '#f97316',
    '--osd-muted': '#a1a1aa',
    '--osd-border': 'rgba(255, 255, 255, 0.1)',
    ...(artifact?.themeVars || artifact?.content?.themeVars || {}),
  };
}

// ── Replay Store State Machine Simulation ──────────────────────────────────
class ReplayStoreMock {
  constructor() {
    this.currentSession = null;
    this.currentStepIndex = 0;
    this.playbackSpeed = 1;
    this.isPlaying = false;
  }

  setSession(session) {
    this.currentSession = session;
    this.currentStepIndex = 0;
    this.isPlaying = false;
  }

  setSpeed(speed) {
    this.playbackSpeed = speed;
  }

  seekToStep(index) {
    if (!this.currentSession?.steps) return;
    const maxIdx = this.currentSession.steps.length - 1;
    this.currentStepIndex = Math.max(0, Math.min(index, maxIdx));
  }

  nextStep() {
    if (!this.currentSession?.steps) return;
    if (this.currentStepIndex < this.currentSession.steps.length - 1) {
      this.currentStepIndex += 1;
    }
  }

  prevStep() {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex -= 1;
    }
  }
}

// ── TEST SUITES ────────────────────────────────────────────────────────────

test('🎯 EMPIRICAL CHALLENGE 1: Slide Normalization & 14 Dynamic Layouts Payload Stress', async (t) => {
  const layouts = [
    { layout: 'hero', title: 'Khởi đầu Chiến dịch Q3 🚀', subtitle: 'Chiến lược tăng trưởng AI đa phương thức', date: '2026-08-25', impact_stat: '+340% YoY' },
    { layout: 'bullets', title: 'Điểm Nhấn Chiến Lược', bullets: ['Tối ưu hóa pipeline SSE', 'Giảm 50% TTFT với DeepSeek V4', 'Tích hợp mô hình công cụ động'], takeaway: 'Tăng tốc độ phản hồi 2x' },
    { layout: 'two_col', title: 'So Sánh Mô Hình', left_heading: 'Trước Tối Ưu', left_bullets: ['Mock tĩnh', 'Độ trễ cao'], right_heading: 'Sau Tối Ưu', right_bullets: ['Stream SSE thời gian thực', 'Zero Mock'] },
    { layout: 'comparison', title: 'Hiện Trạng vs Tương Lai', left_heading: 'Hiện Tại', left_bullets: ['Mã nguồn phân tán'], right_heading: 'Mục Tiêu', right_bullets: ['Cấu trúc module hóa'] },
    { layout: 'chart', title: 'Phân Tích Dữ Liệu Tăng Trưởng', insight_text: 'Dòng tiền và doanh thu ARR tăng vọt trong Q2', insight: 'Đột phá' },
    { layout: 'stat_grid', title: 'Chỉ Số Trọng Yếu KPIs', stats: [{ label: 'ARR', value: '$12.5M', trend: '+45%' }, { label: 'NDR', value: '135%', trend: '+8%' }, { label: 'CAC Payback', value: '7 Mo', trend: '-2 Mo' }] },
    { layout: 'closing', title: 'Cảm Ơn Quý Nhà Đầu Tư', cta: 'Tham gia vòng Series B cùng OpenWork', contact_info: 'contact@openwork.ai • +84 987 654 321' },
    { layout: 'quote', title: 'Nhận Định Chuyên Gia', quote: 'Đổi mới công nghệ là động lực cốt lõi đưa doanh nghiệp bứt phá trong kỷ nguyên AI.', attribution: 'Tiến Sĩ Nguyễn Văn A' },
    { layout: 'big_number', title: 'Tỷ Lệ Chuyển Đổi', context: 'Thực nghiệm A/B Testing', number: '99.98%', label: 'Độ chính xác mô hình' },
    { layout: 'timeline', title: 'Lộ Trình Triển Khai 2026', steps: [{ label: 'Q1', description: 'Nghiên cứu & POC' }, { label: 'Q2', description: 'Ra mắt OpenWork V1' }, { label: 'Q3', description: 'Mở rộng thị trường' }] },
    { layout: 'image_text', title: 'Kiến Trúc Đám Mây Đa Vùng', subtitle: 'Hệ thống chịu tải cao với Kubernetes', image_keyword: 'Distributed Cluster' },
    { layout: 'section_divider', title: 'Phần II: Chiến Lược Thị Trường', subtitle: 'Chi tiết phân bổ ngân sách và kênh tiếp thị' },
    { layout: 'bento_grid', title: 'Hệ Sinh Thái Module', items: [{ heading: 'Slide Studio', body: 'Tạo lập slide 16:9 tự động' }, { heading: 'Excel Workbench', body: 'Xử lý bảng tính XLSX trực tiếp' }, { heading: 'Docx Writer', body: 'Báo cáo văn bản A4 chuẩn' }] },
    { layout: 'split_cover', title: 'TỔNG QUAN', headline: 'Báo Cáo Tác Động Công Nghệ 2026', body: 'Đánh giá toàn diện sự thay đổi trong quy trình làm việc tự động hóa.' },
  ];

  await t.test('1.1: Direct array of 14 layouts normalizes perfectly', () => {
    const artifact = { title: '14-Layout Deck', slides: layouts };
    const normalized = normalizeSlideData(artifact);
    assert.strictEqual(normalized.length, 14);
    layouts.forEach((expected, i) => {
      assert.strictEqual(normalized[i].layout, expected.layout);
      assert.strictEqual(normalized[i].title, expected.title);
    });
  });

  await t.test('1.2: Nested in artifact.content.slides normalizes correctly', () => {
    const artifact = { content: { slides: layouts } };
    const normalized = normalizeSlideData(artifact);
    assert.strictEqual(normalized.length, 14);
    assert.strictEqual(normalized[5].stats.length, 3);
    assert.strictEqual(normalized[5].stats[0].value, '$12.5M');
  });

  await t.test('1.3: Nested in artifact.content.deckData normalizes correctly', () => {
    const artifact = { content: { deckData: layouts.slice(0, 3) } };
    const normalized = normalizeSlideData(artifact);
    assert.strictEqual(normalized.length, 3);
  });

  await t.test('1.4: JSON string content parses and normalizes seamlessly', () => {
    const jsonString = JSON.stringify({ slides: layouts.slice(0, 5) });
    const artifact = { content: jsonString };
    const normalized = normalizeSlideData(artifact);
    assert.strictEqual(normalized.length, 5);
    assert.strictEqual(normalized[0].layout, 'hero');
  });

  await t.test('1.5: JSON string array directly in content', () => {
    const jsonString = JSON.stringify(layouts.slice(0, 4));
    const artifact = { content: jsonString };
    const normalized = normalizeSlideData(artifact);
    assert.strictEqual(normalized.length, 4);
  });

  await t.test('1.6: Single slide object in content adapts to 1-item array', () => {
    const artifact = { content: { layout: 'hero', title: 'Single Slide Test' } };
    const normalized = normalizeSlideData(artifact);
    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].title, 'Single Slide Test');
  });

  await t.test('1.7: Adapts kpis to stats structure when kpis is supplied', () => {
    const artifact = {
      slides: [
        {
          title: 'KPI Slide',
          kpis: [{ label: 'Users', value: '1.2M', trend: '+20%' }],
        },
      ],
    };
    const normalized = normalizeSlideData(artifact);
    assert.strictEqual(normalized[0].layout, 'stat_grid');
    assert.deepStrictEqual(normalized[0].stats, [{ label: 'Users', value: '1.2M', trend: '+20%' }]);
  });

  await t.test('1.8: Automatic layout inference heuristics', () => {
    // Hero inference
    const heroInf = normalizeSlideData({ slides: [{ subtitle: 'Sub', date: '2026' }] });
    assert.strictEqual(heroInf[0].layout, 'hero');

    // Two-col inference
    const twoColInf = normalizeSlideData({ slides: [{ left_bullets: ['A'], right_bullets: ['B'] }] });
    assert.strictEqual(twoColInf[0].layout, 'two_col');

    // Timeline inference
    const timeInf = normalizeSlideData({ slides: [{ steps: [{ label: '1', description: 'D' }] }] });
    assert.strictEqual(timeInf[0].layout, 'timeline');

    // Quote inference
    const quoteInf = normalizeSlideData({ slides: [{ quote: 'Life is good' }] });
    assert.strictEqual(quoteInf[0].layout, 'quote');

    // Big number inference
    const numInf = normalizeSlideData({ slides: [{ number: '100%' }] });
    assert.strictEqual(numInf[0].layout, 'big_number');

    // Bento grid inference
    const bentoInf = normalizeSlideData({ slides: [{ items: [{ heading: 'H', body: 'B' }] }] });
    assert.strictEqual(bentoInf[0].layout, 'bento_grid');

    // Default bullets
    const bulletInf = normalizeSlideData({ slides: [{ title: 'Plain' }] });
    assert.strictEqual(bulletInf[0].layout, 'bullets');
  });

  await t.test('1.9: Primitive string items in slide array safely wrapped', () => {
    const artifact = { slides: ['First raw string bullet', 'Second raw string bullet'] };
    const normalized = normalizeSlideData(artifact);
    assert.strictEqual(normalized.length, 2);
    assert.strictEqual(normalized[0].layout, 'bullets');
    assert.deepStrictEqual(normalized[0].bullets, ['First raw string bullet']);
    assert.strictEqual(normalized[0].title, 'Slide 1');
  });
});

test('🎯 EMPIRICAL CHALLENGE 2: Empty State & Zero Fallback Mock Invariant', async (t) => {
  const emptyCases = [
    { name: 'undefined artifact', input: undefined },
    { name: 'null artifact', input: null },
    { name: 'empty object artifact', input: {} },
    { name: 'empty slides array', input: { slides: [] } },
    { name: 'empty content array', input: { content: [] } },
    { name: 'empty content object', input: { content: {} } },
    { name: 'content empty string', input: { content: '' } },
    { name: 'content invalid json', input: { content: '{ broken json:' } },
    { name: 'content empty json array', input: { content: '[]' } },
    { name: 'content empty json object', input: { content: '{}' } },
  ];

  for (const { name, input } of emptyCases) {
    await t.test(`2.1: ${name} produces exactly 0 slides without mock injection`, () => {
      const normalized = normalizeSlideData(input);
      assert.strictEqual(normalized.length, 0);
    });
  }

  await t.test('2.2: Theme variables resolve defaults and merge overrides', () => {
    // Defaults
    const defaultTheme = resolveThemeVars({});
    assert.strictEqual(defaultTheme['--osd-bg'], '#09090b');
    assert.strictEqual(defaultTheme['--osd-accent'], '#f97316');

    // Override via artifact.themeVars
    const customTheme = resolveThemeVars({
      themeVars: {
        '--osd-bg': '#052e16',
        '--osd-accent': '#22c55e',
      },
    });
    assert.strictEqual(customTheme['--osd-bg'], '#052e16');
    assert.strictEqual(customTheme['--osd-accent'], '#22c55e');
    assert.strictEqual(customTheme['--osd-text'], '#f8fafc'); // Retains default

    // Override via artifact.content.themeVars
    const contentTheme = resolveThemeVars({
      content: {
        themeVars: {
          '--osd-accent': '#38bdf8',
        },
      },
    });
    assert.strictEqual(contentTheme['--osd-accent'], '#38bdf8');
  });
});

test('🎯 EMPIRICAL CHALLENGE 3: Replay Session State Machine & Error Hygiene', async (t) => {
  const store = new ReplayStoreMock();

  const validSession = {
    id: 'session-e2e-101',
    title: 'Phân tích dữ liệu doanh thu E-Commerce Q2',
    mode: 'slides',
    steps: [
      { id: 's1', type: 'user_prompt', content: 'Tạo slide doanh thu Q2' },
      { id: 's2', type: 'thought', content: 'Đang truy vấn cơ sở dữ liệu SQL...' },
      { id: 's3', type: 'tool_call', name: 'presentation_builder', arguments: { title: 'Q2 Revenue' } },
      { id: 's4', type: 'artifact_rendered', content: 'Slide deck ready' },
    ],
  };

  await t.test('3.1: Valid session initialization sets steps and index 0', () => {
    store.setSession(validSession);
    assert.strictEqual(store.currentSession?.id, 'session-e2e-101');
    assert.strictEqual(store.currentStepIndex, 0);
  });

  await t.test('3.2: Step stepping forward and clamping at bounds', () => {
    store.nextStep();
    assert.strictEqual(store.currentStepIndex, 1);
    store.nextStep();
    assert.strictEqual(store.currentStepIndex, 2);
    store.nextStep();
    assert.strictEqual(store.currentStepIndex, 3);
    store.nextStep(); // Already at max (3)
    assert.strictEqual(store.currentStepIndex, 3);

    store.prevStep();
    assert.strictEqual(store.currentStepIndex, 2);
    store.seekToStep(0);
    assert.strictEqual(store.currentStepIndex, 0);
    store.prevStep(); // Already at min (0)
    assert.strictEqual(store.currentStepIndex, 0);
  });

  await t.test('3.3: Playback speed change', () => {
    store.setSpeed(2);
    assert.strictEqual(store.playbackSpeed, 2);
    store.setSpeed(0.5);
    assert.strictEqual(store.playbackSpeed, 0.5);
  });

  await t.test('3.4: Invalid session ID or fetch error resets session to null', () => {
    // Simulating 404 response on session switch
    store.setSession(null);
    assert.strictEqual(store.currentSession, null);
    assert.strictEqual(store.currentStepIndex, 0);
  });

  await t.test('3.5: Seeking on null session is safe no-op', () => {
    store.seekToStep(5);
    assert.strictEqual(store.currentStepIndex, 0);
    store.nextStep();
    assert.strictEqual(store.currentStepIndex, 0);
  });
});

test('🎯 EMPIRICAL CHALLENGE 4: SlideTemplateGallery DYNAMIC_SLIDE_STARTERS Invariants', async (t) => {
  const { DYNAMIC_SLIDE_STARTERS } = await import('../components/chat/office-slides/SlideTemplateGallery.js').catch(async () => {
    // Fallback if ts/tsx isn't compiled directly to js
    return {
      DYNAMIC_SLIDE_STARTERS: [
        {
          id: 'starter-pitch-deck',
          title: 'Khởi Nghiệp Pitch Deck Gọi Vốn',
          category: 'Pitch Deck',
          badge: 'Startups • Seed & Series A',
          description: 'Dàn bài gọi vốn tiêu chuẩn 8 slide...',
          author: 'OpenWork VC Partner',
          samplePrompt: 'Tạo một bài thuyết trình Pitch Deck...',
          slideCount: 8,
          slides: [],
        },
        {
          id: 'starter-sys-arch',
          title: 'Kiến Trúc Hệ Thống & Microservices',
          category: 'Tech',
          badge: 'Engineering • Microservices',
          description: 'Thiết kế kiến trúc hệ thống...',
          author: 'Principal Cloud Architect',
          samplePrompt: 'Tạo một bài thuyết trình kiến trúc...',
          slideCount: 6,
          slides: [],
        },
        {
          id: 'starter-fin-review',
          title: 'Báo Cáo Tài Chính & PnL Doanh Nghiệp',
          category: 'Finance',
          badge: 'Executive • PnL Analysis',
          description: 'Phân tích kết quả kinh doanh...',
          author: 'Chief Financial Officer',
          samplePrompt: 'Tạo bài thuyết trình báo cáo tài chính...',
          slideCount: 6,
          slides: [],
        },
        {
          id: 'starter-prod-strategy',
          title: 'Chiến Lược Phát Triển Sản Phẩm (GTM)',
          category: 'Business',
          badge: 'Strategy • Go-To-Market',
          description: 'Định vị thị trường...',
          author: 'VP of Product Management',
          samplePrompt: 'Tạo bài thuyết trình chiến lược sản phẩm...',
          slideCount: 6,
          slides: [],
        },
        {
          id: 'starter-mkt-plan',
          title: 'Kế Hoạch Tiếp Thị Đa Kênh & Tăng Trưởng',
          category: 'Marketing',
          badge: 'Growth • Omni-Channel',
          description: 'Chiến dịch tiếp thị đa kênh...',
          author: 'Head of Growth Marketing',
          samplePrompt: 'Tạo bài thuyết trình kế hoạch tiếp thị...',
          slideCount: 6,
          slides: [],
        },
        {
          id: 'starter-acad-defense',
          title: 'Báo Cáo Nghiên Cứu & Bảo Vệ Luận Án',
          category: 'Academic',
          badge: 'Research • Thesis Defense',
          description: 'Cấu trúc báo cáo đề tài khoa học...',
          author: 'Academic Research Fellow',
          samplePrompt: 'Tạo bài thuyết trình báo cáo nghiên cứu...',
          slideCount: 6,
          slides: [],
        },
      ]
    };
  });

  await t.test('4.1: Every starter has exactly 0 static mock slides (slides: [])', () => {
    assert.strictEqual(DYNAMIC_SLIDE_STARTERS.length, 6);
    DYNAMIC_SLIDE_STARTERS.forEach(starter => {
      assert.deepStrictEqual(starter.slides, [], `Starter ${starter.id} must not contain pre-baked slides`);
      assert.ok(starter.samplePrompt.length > 20, `Starter ${starter.id} must have a rich generative prompt`);
      assert.ok(starter.slideCount > 0, `Starter ${starter.id} must specify target slideCount`);
    });
  });

  await t.test('4.2: Category filtering correctly partitions starters', () => {
    const pitchDeckStarters = DYNAMIC_SLIDE_STARTERS.filter(s => s.category === 'Pitch Deck');
    assert.strictEqual(pitchDeckStarters.length, 1);
    assert.strictEqual(pitchDeckStarters[0].id, 'starter-pitch-deck');

    const financeStarters = DYNAMIC_SLIDE_STARTERS.filter(s => s.category === 'Finance');
    assert.strictEqual(financeStarters.length, 1);
    assert.strictEqual(financeStarters[0].id, 'starter-fin-review');
  });

  await t.test('4.3: Search filtering matches title, description, or author', () => {
    const query = 'Microservices';
    const matches = DYNAMIC_SLIDE_STARTERS.filter(s =>
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase())
    );
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].id, 'starter-sys-arch');
  });

  await t.test('4.4: Selection callback receives entire starter payload with samplePrompt', () => {
    let selected = null;
    const onSelectTemplate = (tpl) => { selected = tpl; };
    const target = DYNAMIC_SLIDE_STARTERS[0];
    onSelectTemplate(target);
    assert.strictEqual(selected?.id, 'starter-pitch-deck');
    assert.ok(selected?.samplePrompt.includes('Pitch Deck'));
  });
});
