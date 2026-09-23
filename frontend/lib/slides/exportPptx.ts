import type { SlideData } from '@/components/ai-data-analytic/office-slides/types';

/**
 * Real OOXML .pptx export for the 16:9 slide deck.
 *
 * Dispatch is on the FIELDS a slide carries, not on its `layout` string: the
 * generator emits ~14 archetype names but they collapse into 6 body shapes,
 * and an unknown archetype still renders correctly this way.
 */

// 16:9 at pptxgenjs' LAYOUT_16x9 = 10 x 5.625 in.
const W = 10;
const H = 5.625;
const PAD = 0.55;
const BODY_W = W - PAD * 2;

const INK = '201F1D';
const MUTED = '605D5D';
const ACCENT = '8C6239';
const ACCENT_SOFT = 'F5EFE6';
const RULE = 'E4E0DA';
const PAPER = 'FFFFFF';

const FONT = 'Segoe UI';

type Slide = any;
type Pptx = any;

function addTitle(slide: Slide, text: string, y = PAD) {
  slide.addText(text || '', {
    x: PAD,
    y,
    w: BODY_W,
    h: 0.62,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: INK,
    valign: 'middle',
  });
  slide.addShape('rect', {
    x: PAD,
    y: y + 0.66,
    w: 0.9,
    h: 0.035,
    fill: { color: ACCENT },
    line: { type: 'none' },
  });
}

function addTakeaway(slide: Slide, takeaway?: string) {
  if (!takeaway) return;
  slide.addShape('rect', {
    x: PAD,
    y: H - 0.92,
    w: BODY_W,
    h: 0.5,
    fill: { color: ACCENT_SOFT },
    line: { type: 'none' },
  });
  slide.addText(takeaway, {
    x: PAD + 0.16,
    y: H - 0.92,
    w: BODY_W - 0.32,
    h: 0.5,
    fontFace: FONT,
    fontSize: 11,
    italic: true,
    color: ACCENT,
    valign: 'middle',
  });
}

function hasBody(s: SlideData) {
  return Boolean(
    s.stats?.length ||
      s.items?.length ||
      s.steps?.length ||
      s.left_bullets?.length ||
      s.right_bullets?.length ||
      s.bullets?.length
  );
}

function bodyTop(s: SlideData) {
  // Title block ends at PAD + 0.70; add a lane for the subtitle when one is drawn.
  return PAD + (s.subtitle && hasBody(s) ? 1.18 : 0.85);
}

function bodyHeight(s: SlideData) {
  return H - bodyTop(s) - (s.takeaway ? 1.05 : 0.45);
}

function renderCover(slide: Slide, s: SlideData) {
  slide.addShape('rect', { x: 0, y: 0, w: 0.16, h: H, fill: { color: ACCENT }, line: { type: 'none' } });
  slide.addText(s.title || '', {
    x: 0.85, y: 1.5, w: W - 1.7, h: 1.3,
    fontFace: FONT, fontSize: 40, bold: true, color: INK, valign: 'bottom',
  });
  if (s.subtitle) {
    slide.addText(s.subtitle, {
      x: 0.85, y: 2.9, w: W - 1.7, h: 0.7,
      fontFace: FONT, fontSize: 16, color: MUTED,
    });
  }
  const foot = [s.impact_stat, s.date].filter(Boolean).join('   ·   ');
  if (foot) {
    slide.addText(foot, {
      x: 0.85, y: H - 1.05, w: W - 1.7, h: 0.4,
      fontFace: FONT, fontSize: 12, color: ACCENT, bold: true,
    });
  }
}

function renderQuote(slide: Slide, s: SlideData) {
  slide.addText(`“${s.quote || s.title || ''}”`, {
    x: 1.1, y: 1.4, w: W - 2.2, h: 2.2,
    fontFace: FONT, fontSize: 26, italic: true, color: INK, valign: 'middle', align: 'center',
  });
  if (s.attribution) {
    slide.addText(`— ${s.attribution}`, {
      x: 1.1, y: 3.7, w: W - 2.2, h: 0.4,
      fontFace: FONT, fontSize: 13, color: MUTED, align: 'center',
    });
  }
}

function renderBullets(slide: Slide, s: SlideData, x: number, y: number, w: number, h: number, lines: string[]) {
  slide.addText(
    lines.map((t) => ({ text: String(t), options: { breakLine: true } })),
    {
      x, y, w, h,
      fontFace: FONT, fontSize: 14, color: INK, lineSpacingMultiple: 1.4,
      bullet: { characterCode: '2022' }, valign: 'top',
    }
  );
}

function renderTwoCol(slide: Slide, s: SlideData) {
  const y = bodyTop(s);
  const h = bodyHeight(s);
  const colW = (BODY_W - 0.45) / 2;
  const cols = [
    { head: s.left_heading, items: s.left_bullets, x: PAD },
    { head: s.right_heading, items: s.right_bullets, x: PAD + colW + 0.45 },
  ];
  for (const c of cols) {
    if (c.head) {
      slide.addText(c.head, {
        x: c.x, y, w: colW, h: 0.34,
        fontFace: FONT, fontSize: 13, bold: true, color: ACCENT,
      });
    }
    if (c.items?.length) {
      renderBullets(slide, s, c.x, y + (c.head ? 0.42 : 0), colW, h - (c.head ? 0.42 : 0), c.items);
    }
  }
}

function renderStats(slide: Slide, s: SlideData) {
  const stats = s.stats || [];
  const y = bodyTop(s);
  const h = bodyHeight(s);
  const perRow = stats.length <= 3 ? stats.length || 1 : Math.ceil(stats.length / 2);
  const rows = Math.ceil(stats.length / perRow);
  const gap = 0.25;
  const cardW = (BODY_W - gap * (perRow - 1)) / perRow;
  const cardH = Math.min(1.6, (h - gap * (rows - 1)) / rows);

  stats.forEach((st, i) => {
    const cx = PAD + (i % perRow) * (cardW + gap);
    const cy = y + Math.floor(i / perRow) * (cardH + gap);
    slide.addShape('roundRect', {
      x: cx, y: cy, w: cardW, h: cardH,
      fill: { color: ACCENT_SOFT }, line: { color: RULE, width: 0.75 }, rectRadius: 0.06,
    });
    slide.addText(String(st.value ?? ''), {
      x: cx + 0.16, y: cy + 0.14, w: cardW - 0.32, h: cardH * 0.48,
      fontFace: FONT, fontSize: 26, bold: true, color: ACCENT, valign: 'middle',
    });
    slide.addText([st.label, st.subLabel, st.trend].filter(Boolean).join(' · '), {
      x: cx + 0.16, y: cy + cardH * 0.58, w: cardW - 0.32, h: cardH * 0.34,
      fontFace: FONT, fontSize: 11, color: MUTED, valign: 'top',
    });
  });
}

function renderItems(slide: Slide, s: SlideData) {
  const items = s.items || [];
  const y = bodyTop(s);
  const h = bodyHeight(s);
  const perRow = items.length <= 2 ? Math.max(items.length, 1) : Math.min(3, Math.ceil(items.length / 2));
  const rows = Math.ceil(items.length / perRow);
  const gap = 0.22;
  const cardW = (BODY_W - gap * (perRow - 1)) / perRow;
  const cardH = (h - gap * (rows - 1)) / rows;

  items.forEach((it, i) => {
    const cx = PAD + (i % perRow) * (cardW + gap);
    const cy = y + Math.floor(i / perRow) * (cardH + gap);
    slide.addShape('roundRect', {
      x: cx, y: cy, w: cardW, h: cardH,
      fill: { color: PAPER }, line: { color: RULE, width: 0.75 }, rectRadius: 0.06,
    });
    slide.addText(it.heading || '', {
      x: cx + 0.18, y: cy + 0.14, w: cardW - 0.36, h: 0.34,
      fontFace: FONT, fontSize: 13, bold: true, color: INK,
    });
    slide.addText(it.body || '', {
      x: cx + 0.18, y: cy + 0.52, w: cardW - 0.36, h: cardH - 0.68,
      fontFace: FONT, fontSize: 11, color: MUTED, valign: 'top',
    });
  });
}

function renderSteps(slide: Slide, s: SlideData) {
  const steps = s.steps || [];
  const y = bodyTop(s) + 0.35;
  const n = Math.max(steps.length, 1);
  const colW = BODY_W / n;

  slide.addShape('rect', {
    x: PAD, y: y + 0.12, w: BODY_W, h: 0.02,
    fill: { color: RULE }, line: { type: 'none' },
  });

  steps.forEach((st, i) => {
    const cx = PAD + i * colW;
    const done = st.status === 'completed' || st.status === 'in_progress';
    slide.addShape('ellipse', {
      x: cx + colW / 2 - 0.09, y: y + 0.04, w: 0.18, h: 0.18,
      fill: { color: done ? ACCENT : RULE }, line: { type: 'none' },
    });
    slide.addText(st.label || '', {
      x: cx, y: y + 0.34, w: colW, h: 0.36,
      fontFace: FONT, fontSize: 12, bold: true, color: INK, align: 'center',
    });
    slide.addText(st.description || '', {
      x: cx + 0.06, y: y + 0.72, w: colW - 0.12, h: 1.4,
      fontFace: FONT, fontSize: 10, color: MUTED, align: 'center', valign: 'top',
    });
  });
}

function renderBody(slide: Slide, s: SlideData) {
  if (s.stats?.length) return renderStats(slide, s);
  if (s.items?.length) return renderItems(slide, s);
  if (s.steps?.length) return renderSteps(slide, s);
  if (s.left_bullets?.length || s.right_bullets?.length) return renderTwoCol(slide, s);

  if (s.bullets?.length) {
    return renderBullets(slide, s, PAD, bodyTop(s), BODY_W, bodyHeight(s), s.bullets);
  }

  const fallback = s.subtitle || s.impact_stat;
  if (fallback) {
    slide.addText(fallback, {
      x: PAD, y: bodyTop(s), w: BODY_W, h: bodyHeight(s),
      fontFace: FONT, fontSize: 15, color: MUTED, valign: 'top',
    });
  }
}

/** Build a real .pptx and trigger a browser download. */
export async function exportDeckToPptx(deckTitle: string, slides: SlideData[]): Promise<void> {
  // Dynamic import: pptxgenjs is ~1MB and only needed on an explicit download.
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS() as Pptx;

  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deckTitle;

  slides.forEach((s, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: PAPER };

    const layout = String(s.layout || 'bullets');

    if (layout === 'hero' || layout === 'cover' || layout === 'closing') {
      renderCover(slide, s);
      return;
    }
    if (layout === 'quote' || s.quote) {
      renderQuote(slide, s);
      return;
    }

    addTitle(slide, s.title);
    // A subtitle is only drawn as a deck head when the body has its own
    // content; with an empty body renderBody promotes it instead of
    // printing it twice.
    if (s.subtitle && hasBody(s)) {
      slide.addText(s.subtitle, {
        x: PAD, y: PAD + 0.72, w: BODY_W, h: 0.3,
        fontFace: FONT, fontSize: 12, color: MUTED,
      });
    }
    renderBody(slide, s);
    addTakeaway(slide, s.takeaway);

    slide.addText(String(idx + 1), {
      x: W - PAD - 0.5, y: H - 0.42, w: 0.5, h: 0.28,
      fontFace: FONT, fontSize: 9, color: MUTED, align: 'right',
    });
  });

  const fileName = `${(deckTitle || 'presentation').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_')}.pptx`;
  await pptx.writeFile({ fileName });
}
