---
name: Anthropic Claude Canvas Design DNA
colors:
  # Anthropic Claude Parchment Canvas (Light Theme)
  bg-base-light: "#FAF9F5"
  bg-surface-light: "#FFFFFF"
  bg-muted-light: "#F3F2EC"
  fg-primary-light: "#1E1E1C"
  fg-secondary-light: "#63625D"
  border-subtle-light: "#E6E4DD"
  accent-light: "#CC785C"
  accent-soft-light: "rgba(204, 120, 92, 0.08)"
  canvas-light: "#FAF9F5"
  surface-1-light: "#FFFFFF"
  surface-2-light: "#F3F2EC"
  surface-3-light: "#eeeae3"
  text-primary-light: "#1E1E1C"
  text-secondary-light: "#63625D"
  text-tertiary-light: "#9c978f"
  border-light: "#E6E4DD"
  border-default-light: "#E6E4DD"

  # Anthropic Claude Warm Obsidian Canvas (Dark Theme)
  bg-base-dark: "#181816"
  bg-surface-dark: "#21201D"
  bg-muted-dark: "#2A2926"
  fg-primary-dark: "#F4F3ED"
  fg-secondary-dark: "#A3A29B"
  border-subtle-dark: "#33322E"
  accent-dark: "#D97757"
  accent-soft-dark: "rgba(217, 119, 87, 0.12)"
  canvas-dark: "#181816"
  surface-1-dark: "#21201D"
  surface-2-dark: "#2A2926"
  surface-3-dark: "#33322E"
  text-primary-dark: "#F4F3ED"
  text-secondary-dark: "#A3A29B"
  text-tertiary-dark: "#71706c"
  border-dark: "#33322E"
  border-default-dark: "#33322E"

  # Signature Anthropic Claude Terracotta Coral
  accent-terracotta: "#CC785C"
  accent-terracotta-hover: "#b8654b"
  accent-terracotta-soft: "rgba(204, 120, 92, 0.08)"
  accent-terracotta-border: "rgba(204, 120, 92, 0.25)"
  accent-coral-glow: "rgba(204, 120, 92, 0.25)"
  code-bg-light: "#F3F2EC"
  code-bg-dark: "#121110"
typography:
  font-sans: '"Plus Jakarta Sans", "Be Vietnam Pro", "Instrument Sans", "Geist", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  font-serif: '"Lora", Georgia, serif'
  font-heading: '"Cormorant Garamond", Georgia, serif'
  font-mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  scale:
    xs: { fontSize: "0.75rem", lineHeight: "1.4" }
    sm: { fontSize: "0.875rem", lineHeight: "1.5" }
    base: { fontSize: "0.9375rem", lineHeight: "1.625" }
    md: { fontSize: "1rem", lineHeight: "1.625" }
    lg: { fontSize: "1.125rem", lineHeight: "1.5" }
    xl: { fontSize: "1.25rem", lineHeight: "1.35" }
    "2xl": { fontSize: "1.5rem", lineHeight: "1.25" }
rounded:
  xs: "0.25rem"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  "2xl": "1rem"
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
    backgroundColorLight: "{colors.code-bg-light}"
    backgroundColorDark: "{colors.code-bg-dark}"
    textColorLight: "{colors.text-primary-light}"
    textColorDark: "{colors.text-primary-dark}"
    fontFamily: "{typography.font-mono}"
    rounded: "{rounded.xl}"
  floating-composer:
    backgroundColor: "var(--card)"
    border: "1px solid var(--border)"
    rounded: "{rounded.2xl}"
---

# Anthropic Claude Canvas Design DNA Specification

## 1. Triết Lý Thiết Kế & Bản Sắc Thị Giác (Authentic Claude.ai DNA)
Dự án áp dụng 100% ngôn ngữ thiết kế **Claude Canvas Editorial DNA**:
- Bề mặt giấy parchment ấm áp (#faf8f5) thay vì màu xám xi măng thô ráp.
- Màu nhấn đất nung Terracotta Coral (#da7756 / #c15f3c) đặc trưng của Claude.
- Typography trang nhã kết hợp Serif tiêu đề với Sans tối giản.
- Khung soạn thảo nổi hai tầng thoáng đãng với nút gửi tròn màu Terracotta.

### Các Nguyên Tắc Cốt Lõi
1. **Bề Mặt Warm Canvas & Thang Màu Tự Nhiên**:
   - **Light Mode**: Nền Canvas ấm `#faf8f5`, Card trắng `#ffffff`, Surface phụ `#f5f3ee`. Chữ chính `#1f1e1d`, chữ phụ `#6e6d6b`.
   - **Dark Mode**: Nền Obsidian ấm `#181716`, Card `#222120`, Surface phụ `#2a2826`. Chữ `#f5f4f0`.
2. **Điểm Nhấn Anthropic Terracotta Coral**:
   - Màu chủ đạo `#da7756`, hover `#c15f3c`, quầng sáng `rgba(218, 119, 86, 0.25)`.
   - Nút Send tròn màu Terracotta với mũi tên trắng `ArrowUp`.
3. **Bộ Phông Chữ Đa Tầng (Claude Editorial Typography)**:
   - Thân bài & Nút bấm: `Instrument Sans` / `Geist`
   - Đọc trường thiên & Suy nghĩ: `Lora`
   - Tiêu đề & Nhãn hiệu: `Cormorant Garamond`
   - Mã nguồn & Số liệu: `Geist Mono`
4. **Đồng Bộ Tuyệt Đối 100%**:
   - Áp dụng trên toàn bộ Shell, Chat, Composer, Subpages và Workbench (Word A4, Excel, Slide).
5. **Thanh Cuộn Siêu Mỏng (.custom-scrollbar)**:
   - Độ rộng 6px tinh tế, màu sắc tự thích ứng canvas.
