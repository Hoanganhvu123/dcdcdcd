import React, { useState, useCallback } from 'react';
import './styles/openwork-legal.css';

export interface LegalDecisionOption {
  id: string;
  title: string;
  preview: string;
  basis: string;
}

export interface OpenWorkLegalDecisionBlockProps {
  id?: string;
  title?: string;
  wantText?: string;
  allowText?: string;
  options?: LegalDecisionOption[];
  defaultSelectedId?: string;
  isDecided?: boolean;
  decidedId?: string;
  onApply?: (selectedOptionId: string, customText?: string) => void;
  onKeepRisk?: () => void;
  className?: string;
}

const DEFAULT_OPTIONS: LegalDecisionOption[] = [
  {
    id: 'a',
    title: 'Phạt 8% + bồi thường thiệt hại thực tế',
    preview: 'Bên vi phạm phải chịu phạt 8% giá trị phần nghĩa vụ hợp đồng bị vi phạm theo Điều 301 Luật Thương mại năm 2005; ngoài khoản phạt nêu trên, bên vi phạm còn phải bồi thường toàn bộ tổn thất thực tế, trực tiếp và khoản lợi đáng lẽ được hưởng theo Điều 302 Luật Thương mại năm 2005.',
    basis: 'Điều 301 và Điều 302 Luật Thương mại 2005',
  },
  {
    id: 'b',
    title: 'Bỏ phạt, chỉ bồi thường thiệt hại (không trần)',
    preview: 'Các bên không áp dụng chế tài phạt vi phạm. Bên vi phạm phải bồi thường toàn bộ tổn thất thực tế, trực tiếp và khoản lợi đáng lẽ được hưởng theo Điều 302 Luật Thương mại năm 2005; bên yêu cầu bồi thường có nghĩa vụ chứng minh tổn thất.',
    basis: 'Điều 302 Luật Thương mại 2005',
  },
  {
    id: 'other',
    title: 'Câu trả lời khác — tôi tự nhập',
    preview: 'Gõ chỉ đạo riêng vào ô nhập bên dưới, ví dụ giữ trần 8% nhưng thêm bảo lãnh ngân hàng.',
    basis: 'Agent sẽ soạn theo đúng lời bạn, vẫn chặn phần vượt trần',
  },
];

const DEFAULT_WANT = 'Phạt 50% giá trị hợp đồng — tức 9.000.000.000 đồng khi có vi phạm.';
const DEFAULT_ALLOW = 'Tối đa 8% giá trị phần nghĩa vụ bị vi phạm, tương đương 1.440.000.000 đồng — Điều 301 Luật Thương mại 2005.';

/**
 * OpenWorkLegalDecisionBlock
 * Dual-Column Legal Decision Gating ("Bạn yêu cầu" vs "Luật cho phép")
 * Features:
 * - Dual comparison columns with Lora typography (color #865047 vs #2b643a)
 * - Interactive option selection cards with custom styled radio dots
 * - Risk override: "Giữ nguyên — tôi chịu rủi ro"
 * - Primary action: "Áp dụng & viết tiếp →"
 * - Reactive state resolution displaying drafted clause upon decision
 */
export const OpenWorkLegalDecisionBlock: React.FC<OpenWorkLegalDecisionBlockProps> = ({
  id,
  title = 'Mức phạt 50% vượt trần 8% của Luật Thương mại',
  wantText = DEFAULT_WANT,
  allowText = DEFAULT_ALLOW,
  options = DEFAULT_OPTIONS,
  defaultSelectedId = 'a',
  isDecided: controlledIsDecided,
  decidedId: controlledDecidedId,
  onApply,
  onKeepRisk,
  className = '',
}) => {
  const [selectedId, setSelectedId] = useState<string>(defaultSelectedId);
  const [internalDecided, setInternalDecided] = useState<boolean>(false);
  const [internalDecidedType, setInternalDecidedType] = useState<string>('');
  const [customText, setCustomText] = useState<string>('');

  const isDecided = controlledIsDecided !== undefined ? controlledIsDecided : internalDecided;
  const activeDecidedId = controlledDecidedId || internalDecidedType;

  const handleSelectOption = useCallback((optionId: string) => {
    if (isDecided) return;
    setSelectedId(optionId);
  }, [isDecided]);

  const handleApply = useCallback(() => {
    setInternalDecided(true);
    setInternalDecidedType(selectedId);
    if (onApply) {
      onApply(selectedId, selectedId === 'other' ? customText : undefined);
    }
  }, [selectedId, customText, onApply]);

  const handleKeepRisk = useCallback(() => {
    setInternalDecided(true);
    setInternalDecidedType('keep');
    if (onKeepRisk) {
      onKeepRisk();
    }
  }, [onKeepRisk]);

  const chosenOption = options.find((opt) => opt.id === (activeDecidedId || selectedId));

  return (
    <div
      id={id}
      data-legal-decision-block=""
      className={`legal-ask-card not-prose ${className}`}
    >
      {/* ── Header ── */}
      <div className="legal-ask-header">
        <span className="legal-ask-icon" aria-hidden="true">!</span>
        <span className="legal-ask-title">{title}</span>
        <span className={isDecided ? 'legal-ask-pill-done' : 'legal-ask-pill-waiting'}>
          {isDecided ? 'đã chốt' : 'chờ bạn chốt'}
        </span>
      </div>

      {/* ── Dual Comparison Columns ── */}
      <div className="legal-ask-dual-cols">
        <div className="legal-ask-col-left">
          <span className="legal-ask-col-label">Bạn yêu cầu</span>
          <span className="legal-ask-want-body">{wantText}</span>
        </div>
        <div className="legal-ask-col-right">
          <span className="legal-ask-col-label">Luật cho phép</span>
          <span className="legal-ask-allow-body">{allowText}</span>
        </div>
      </div>

      {/* ── Options Selection List ── */}
      {!isDecided && (
        <>
          <div className="legal-ask-opts">
            {options.map((opt) => {
              const isSelected = selectedId === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
                  className={`legal-ask-option-card ${isSelected ? 'is-selected' : ''}`}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectOption(opt.id);
                    }
                  }}
                >
                  <div className="legal-ask-option-header">
                    <span className="legal-ask-radio" aria-hidden="true" />
                    <span className="legal-ask-option-title">{opt.title}</span>
                  </div>
                  <span className="legal-ask-option-preview">{opt.preview}</span>
                  <span className="legal-ask-option-basis">{opt.basis}</span>

                  {opt.id === 'other' && isSelected && (
                    <div className="mt-2.5 pl-[22px]">
                      <input
                        type="text"
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        placeholder="Nhập yêu cầu riêng (ví dụ: bổ sung thư bảo lãnh ngân hàng)…"
                        className="w-full text-xs px-2.5 py-1.5 rounded-md border border-[#e7e6e4] dark:border-[#33322e] bg-white dark:bg-[#181816] text-[#201f1d] dark:text-[#f4f3ed] focus:outline-none focus:border-[#011627]"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Action Footer ── */}
          <div className="legal-ask-footer">
            <button
              type="button"
              onClick={handleKeepRisk}
              className="legal-ask-btn-risk"
            >
              Giữ nguyên — tôi chịu rủi ro
            </button>
            <div className="flex-1" />
            <span className="legal-ask-status-waiting">
              Trợ lý đang chờ bạn
            </span>
            <button
              type="button"
              onClick={handleApply}
              className="legal-ask-btn-apply"
            >
              Áp dụng &amp; viết tiếp →
            </button>
          </div>
        </>
      )}

      {/* ── Decided Resolution Card ── */}
      {isDecided && (
        <div
          className={`legal-ask-resolution ${
            activeDecidedId === 'keep' ? 'is-risk' : 'is-compliant'
          }`}
        >
          <span className="legal-ask-res-title">
            {activeDecidedId === 'keep'
              ? 'Bạn chọn giữ mức phạt theo yêu cầu — đã viết kèm cảnh báo rủi ro:'
              : 'Đã chốt và đưa vào Điều 8 của hợp đồng:'}
          </span>
          <span className="legal-ask-res-body">
            {activeDecidedId === 'keep'
              ? 'Bên vi phạm phải chịu phạt 50% giá trị hợp đồng khi có vi phạm. (Cảnh báo: Mức phạt 50% vượt quá trần 8% theo Điều 301 Luật Thương mại 2005; phần vượt trần có nguy cơ vô hiệu khi tranh tụng tại Tòa án).'
              : activeDecidedId === 'other' && customText.trim()
                ? `Bên vi phạm phải chịu phạt 8% giá trị phần nghĩa vụ bị vi phạm theo Điều 301 LTM 2005. ${customText.trim()}`
                : chosenOption?.preview || 'Đã áp dụng phương án tuân thủ pháp luật.'}
          </span>
        </div>
      )}
    </div>
  );
};

export default OpenWorkLegalDecisionBlock;
