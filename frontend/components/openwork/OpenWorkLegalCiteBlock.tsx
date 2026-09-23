import React, { useState, useEffect, useRef, useCallback } from 'react';
import './styles/openwork-legal.css';

export interface LegalCiteRow {
  code: string;
  text: string;
  pill: string;
  tone?: 'ok' | 'bad' | 'neutral';
}

export interface OpenWorkLegalCiteBlockProps {
  id?: string;
  title?: string;
  latencyMs?: string | number;
  isRunning?: boolean;
  waitText?: string;
  rows?: LegalCiteRow[];
  note?: string;
  className?: string;
  onCiteClick?: (code: string, verbatimText: string) => void;
}

/**
 * Authentic Vietnamese Statutory Law Database for verbatim citation lookup
 */
export const STATUTORY_LAWS: Record<string, string> = {
  'Điều 472 BLDS 2015': 'Hợp đồng thuê tài sản là sự thỏa thuận giữa các bên, theo đó bên cho thuê giao tài sản cho bên thuê sử dụng trong một thời hạn, bên thuê phải trả tiền thuê.',
  'Điều 328 BLDS 2015': 'Bên nhận đặt cọc từ chối việc thực hiện hợp đồng thì phải trả cho bên đặt cọc tài sản đặt cọc và một khoản tiền tương đương giá trị tài sản đặt cọc, trừ trường hợp có thỏa thuận khác.',
  'Điều 428 BLDS 2015': 'Đơn phương chấm dứt không có căn cứ thì bên chấm dứt được xác định là bên vi phạm nghĩa vụ và phải thực hiện trách nhiệm dân sự theo quy định của Bộ luật này.',
  'Điều 301 LTM 2005': 'Mức phạt đối với vi phạm nghĩa vụ hợp đồng hoặc tổng mức phạt đối với nhiều vi phạm do các bên thoả thuận nhưng không quá 8% giá trị phần nghĩa vụ hợp đồng bị vi phạm.',
  'Điều 302 LTM 2005': 'Bồi thường thiệt hại gồm giá trị tổn thất thực tế, trực tiếp mà bên bị vi phạm phải chịu và khoản lợi trực tiếp đáng lẽ được hưởng.',
  'Điều 39 BLTTDS 2015': 'Tòa án nơi bị đơn cư trú, làm việc hoặc có trụ sở có thẩm quyền giải quyết theo thủ tục sơ thẩm những tranh chấp về dân sự, kinh doanh, thương mại.'
};

const DEFAULT_ROWS: LegalCiteRow[] = [
  {
    code: 'Điều 472 BLDS 2015',
    text: 'Định nghĩa hợp đồng thuê tài sản — giao tài sản dùng trong một thời hạn, trả tiền thuê.',
    pill: 'Còn hiệu lực',
    tone: 'ok',
  },
  {
    code: 'Điều 328 BLDS 2015',
    text: 'Bên nhận cọc từ chối thực hiện phải hoàn cọc và trả thêm một khoản tương đương giá trị tài sản đặt cọc.',
    pill: 'Còn hiệu lực',
    tone: 'ok',
  },
  {
    code: 'Điều 301 LTM 2005',
    text: 'Trần phạt 8% giá trị phần nghĩa vụ bị vi phạm — thỏa thuận phạt vượt trần sẽ vô hiệu phần vượt.',
    pill: 'Trần luật định',
    tone: 'ok',
  },
  {
    code: 'Điều 302 LTM 2005',
    text: 'Bồi thường thiệt hại gồm toàn bộ tổn thất thực tế, trực tiếp — không bị giới hạn trần.',
    pill: 'Lối ra',
    tone: 'ok',
  },
];

const DEFAULT_NOTE = 'Không có trần cho tiền cọc thuê mặt bằng — mức thỏa thuận của bạn hợp pháp theo Điều 328 Bộ luật Dân sự 2015.';

/**
 * OpenWorkLegalCiteBlock
 * Statutory Law Citation Table with code chips, validity pills, latency badge & interactive verbatim toast
 */
export const OpenWorkLegalCiteBlock: React.FC<OpenWorkLegalCiteBlockProps> = ({
  id,
  title = 'Đối chiếu quy định pháp luật hiện hành',
  latencyMs = '340ms',
  isRunning = false,
  waitText = 'Đang tra cứu cơ sở dữ liệu văn bản quy phạm pháp luật…',
  rows = DEFAULT_ROWS,
  note = DEFAULT_NOTE,
  className = '',
  onCiteClick,
}) => {
  const [activeToast, setActiveToast] = useState<{ code: string; text: string } | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const formattedLatency = typeof latencyMs === 'number' ? `${latencyMs}ms` : latencyMs;

  const handleCite = useCallback((code: string) => {
    const lawText = STATUTORY_LAWS[code] || 'chưa có bản trích trong phiên này.';
    setActiveToast({ code, text: lawText });

    if (onCiteClick) {
      onCiteClick(code, lawText);
    }

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    // Spec: 7000ms duration
    toastTimerRef.current = setTimeout(() => {
      setActiveToast(null);
    }, 7000);
  }, [onCiteClick]);

  const handleCloseToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setActiveToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      id={id}
      data-legal-cite-block=""
      className={`legal-law-card not-prose ${className}`}
    >
      {/* ── Header ── */}
      <div className="legal-law-header">
        <span className="legal-law-title">{title}</span>
        <div className="legal-law-header-spacer" />
        {isRunning && <span className="legal-law-spinner" aria-label="Đang tra cứu" />}
        {!isRunning && formattedLatency && (
          <span className="legal-law-ms">{formattedLatency}</span>
        )}
      </div>

      {/* ── Loading state ── */}
      {isRunning && (
        <span className="legal-law-wait">{waitText}</span>
      )}

      {/* ── Table Rows ── */}
      {!isRunning && (
        <div className="legal-law-content">
          {rows.map((row, index) => {
            const isOk = row.tone !== 'bad';
            return (
              <div key={`${row.code}-${index}`} className="legal-law-row">
                {/* Statutory Code Chip */}
                <button
                  type="button"
                  onClick={() => handleCite(row.code)}
                  className="legal-cite-code"
                  title="Nhấn để xem văn bản điều luật trích lục"
                >
                  {row.code}
                </button>

                {/* Summary Text */}
                <span className="legal-cite-text">{row.text}</span>

                {/* Validity Pill */}
                <span className={isOk ? 'legal-cite-status-ok' : 'legal-cite-status-bad'}>
                  {row.pill}
                </span>
              </div>
            );
          })}

          {/* Diamond Note Box */}
          {note && (
            <div className="legal-cite-note">
              <span className="legal-cite-diamond" aria-hidden="true">◆</span>
              <span className="legal-cite-note-text">{note}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Floating Verbatim Statutory Toast Overlay ── */}
      {activeToast && (
        <div className="legal-toast" role="status" aria-live="polite">
          <span className="legal-toast-icon" aria-hidden="true">§</span>
          <div className="legal-toast-content">
            <strong>{activeToast.code}</strong> — {activeToast.text}
          </div>
          <button
            type="button"
            onClick={handleCloseToast}
            className="legal-toast-close"
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default OpenWorkLegalCiteBlock;
