---
name: OpenWork Claude.ai Anthropic Design DNA
colors:
  # Warm Light Theme
  canvas-light: "#faf8f5"
  card-light: "#ffffff"
  muted-light: "#f5f2eb"
  text-primary-light: "#262624"
  text-secondary-light: "#52514e"
  text-tertiary-light: "#878682"
  border-light: "rgba(11, 11, 11, 0.08)"
  border-subtle-light: "rgba(11, 11, 11, 0.05)"

  # Warm Dark Theme
  canvas-dark: "#1c1917"
  card-dark: "#18181b"
  muted-dark: "#242220"
  text-primary-dark: "#e5e5e4"
  text-secondary-dark: "#a1a1a0"
  text-tertiary-dark: "#71706c"
  border-dark: "rgba(255, 255, 255, 0.08)"
  border-subtle-dark: "rgba(255, 255, 255, 0.04)"

  # Anthropic Accent & Code Block Background
  accent-terracotta: "#da7756"
  accent-coral: "#cc6342"
  accent-hover: "#c15f3e"
  code-bg: "#18181b"
typography:
  font-sans: 'anthropic-sans, "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  font-mono: '"JetBrains Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  font-serif: '"Instrument Serif", Georgia, serif'
  scale:
    xs: { fontSize: "0.75rem", lineHeight: "1.4" }
    sm: { fontSize: "0.875rem", lineHeight: "1.5" }
    base: { fontSize: "0.9375rem", lineHeight: "1.625" }
    md: { fontSize: "1rem", lineHeight: "1.625" }
    lg: { fontSize: "1.125rem", lineHeight: "1.5" }
    xl: { fontSize: "1.25rem", lineHeight: "1.35" }
    "2xl": { fontSize: "1.5rem", lineHeight: "1.25" }
rounded:
  xs: "0.3125rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  "2xl": "1.5rem"
  pill: "9999px"
spacing:
  "1": "0.125rem"
  "2": "0.25rem"
  "3": "0.375rem"
  "4": "0.5rem"
  "5": "0.625rem"
  "6": "0.75rem"
  "7": "1rem"
  "8": "1.5rem"
  "9": "2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-terracotta}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
  button-secondary:
    backgroundColor: "transparent"
    border: "1px solid {colors.border-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.pill}"
  code-block:
    backgroundColor: "{colors.code-bg}"
    textColor: "#e5e5e4"
    fontFamily: "{typography.font-mono}"
    rounded: "{rounded.xl}"
  floating-composer:
    backgroundColor: "var(--dls-surface)"
    border: "1px solid var(--dls-border)"
    rounded: "{rounded.2xl}"
---

# OpenWork Claude.ai Anthropic Design DNA Specification

## 1. Design Philosophy & Aesthetic Core
OpenWork Coworker embodies Anthropic's **Claude.ai Design DNA**: an editorial, warm, highly legible, human-centric visual language. The interface rejects sterile pitch-black (`#000000`) and blinding cold white (`#ffffff`) in favor of warm stone, linen, and charcoal palettes that minimize visual fatigue during prolonged analytical sessions.

### Key Principles
1. **Warm Stone & Ivory Surfaces**:
   - **Warm Dark**: Canvas `#1c1917` (Stone 900), Elevated Cards `#18181b` (Charcoal Zinc), Primary Text `#e5e5e4`, Secondary Text `#a1a1a0`, Warm Borders `rgba(255, 255, 255, 0.08)`.
   - **Warm Light**: Canvas `#faf8f5` (Warm Ivory / Linen), Elevated Cards `#ffffff`, Primary Text `#262624`, Secondary Text `#52514e`, Warm Borders `rgba(11, 11, 11, 0.08)`.
2. **Anthropic Terracotta Accent**:
   - Primary Accent `#da7756` (Warm Terracotta) and `#cc6342` (Warm Coral), replacing generic electric blue or stark monochrome.
3. **Charcoal Code Blocks Across Themes**:
   - All code snippets, terminals, and script viewers use uniform charcoal `#18181b` background with crisp `JetBrains Mono` typography.
4. **Fluid Typography & Generous Leading**:
   - Proportional `rem`/`em` sizing (`text-xs` to `text-base` / `text-lg`), paired with `leading-relaxed` (1.625) for comfortable reading. Zero fixed pixel font-sizes.
5. **Frameless Markdown Flow**:
   - Assistant responses flow directly on the reading canvas without enclosing speech bubbles or heavy card borders.
6. **Single-Line Collapsible Reasoning**:
   - Compact thinking trigger (`"Thought for 5s"` / `"Thinking…"`) with subtle chevron and smooth spring physics expansion.
7. **Floating Pill Composer**:
   - Elevated pill container centered at the bottom with attachment trigger, Claude 3.5 Sonnet model badge, and minimalist send button.
8. **Split-Screen Artifacts Workbench**:
   - Sliding right studio panel with unified Preview / Code / Copy / Download toolbar and specialized format viewers (Word, Excel, Slides, Charts).

---

## 2. Color Palette & Token Architecture

### 2.1 Theme Tokens Reference
| Token | Warm Light (`#faf8f5`) | Warm Dark (`#1c1917`) | Purpose |
|---|---|---|---|
| `--claude-surface-base` | `#faf8f5` | `#1c1917` | Root app background / Canvas |
| `--claude-surface-card` | `#ffffff` | `#18181b` | Elevated cards, sidebars, popovers |
| `--claude-surface-muted` | `#f5f2eb` | `#242220` | Secondary surface / quiet cards |
| `--claude-surface-accent` | `#ebe5db` | `#2d2926` | Interactive hover highlight |
| `--claude-text-primary` | `#262624` | `#e5e5e4` | High-contrast prose & headings |
| `--claude-text-secondary` | `#52514e` | `#a1a1a0` | Muted prose, captions, secondary labels |
| `--claude-text-tertiary` | `#878682` | `#71706c` | Timestamps, metadata, subtle hints |
| `--claude-border` | `rgba(11, 11, 11, 0.08)` | `rgba(255, 255, 255, 0.08)` | Hairline dividers and cards |
| `--claude-code-bg` | `#18181b` | `#18181b` | Syntax highlighted code container |
| `--claude-accent` | `#da7756` | `#da7756` | Anthropic Terracotta primary action |
| `--claude-accent-coral` | `#cc6342` | `#e07a5f` | Warm coral accent |

---

## 3. Typography & Hierarchy

### 3.1 Font Families
- **Primary Body**: `anthropic-sans, "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Code & Syntax**: `"JetBrains Mono", "Geist Mono", ui-monospace, monospace`
- **Editorial Serif**: `"Instrument Serif", Georgia, serif`

### 3.2 Typography Scale
- **Caption / Meta (`text-xs`)**: `0.75rem` (12px equiv), `leading-normal` (1.4)
- **Compact UI / Secondary (`text-sm`)**: `0.875rem` (14px equiv), `leading-relaxed` (1.5)
- **Body Prose (`text-base` / `text-[0.9375rem]`)**: `0.9375rem` - `1rem` (15-16px equiv), `leading-relaxed` (1.625)
- **Subheading (`text-lg`)**: `1.125rem` (18px equiv), `leading-snug` (1.4)
- **Heading (`text-xl` - `text-2xl`)**: `1.25rem` - `1.5rem`, `leading-tight` (1.25)

---

## 4. UI Invariants & Components

### 4.1 Custom Scrollbar
Universal `.custom-scrollbar` class applied to all scrollable areas:
- Thin `6px` track with transparent background
- Rounded `4px` thumb with subtle opacity (`0.25` resting, `0.45` hover)
- Zero layout shift with `scrollbar-gutter: stable`

### 4.2 Smooth Spring Motion
- Expandable accordions (Reasoning block, Workbench drawer) utilize Framer Motion spring curves: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Hover interactions: soft `-translate-y-0.5` and subtle shadow elevations.

### 4.3 Code Blocks
- Rounded corners: `rounded-xl` (`1rem`)
- Header bar: Language tag with monospace font, subtle icon, and top-right Copy button with active checkmark feedback.
- Container: `#18181b` charcoal dark for both themes with horizontal scroll overflow.
