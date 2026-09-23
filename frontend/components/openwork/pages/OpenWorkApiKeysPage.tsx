import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Key, Copy, Check, Eye, EyeOff, Plus, BookOpen, AlertTriangle, ShieldCheck, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeCopyToClipboard } from '@/components/security/MaskedSecretInput';

export interface OpenWorkApiKeysPageProps {
  onCreateKey?: () => void;
}

interface ApiKeyItem {
  id: string;
  name: string;
  tokenMasked: string;
  tokenFull: string;
  scope: string;
  calls30d: string;
  lastUsed: string;
  status: 'active' | 'expiring' | 'revoked';
  expiresIn?: string;
}

const INITIAL_KEYS: ApiKeyItem[] = [
  {
    id: 'key-prod-1',
    name: 'Production DW Analytics',
    tokenMasked: 'ow_live_sk_••••••••••••••••aZgE',
    tokenFull: 'ow_live_sk_948f102a8c39e8b71d9042faZgE',
    scope: 'read:sql, write:artifacts',
    calls30d: '142.850',
    lastUsed: 'Vừa xong (09:41)',
    status: 'active',
  },
  {
    id: 'key-ci-2',
    name: 'CI/CD Automated Testing',
    tokenMasked: 'ow_test_sk_••••••••••••••••K9xQ',
    tokenFull: 'ow_test_sk_01a88b44c77d99ef32e811fK9xQ',
    scope: 'all (admin sandbox)',
    calls30d: '28.120',
    lastUsed: 'Hôm qua 18:20',
    status: 'active',
  },
  {
    id: 'key-bi-3',
    name: 'Metabase Integration Connector',
    tokenMasked: 'ow_live_sk_••••••••••••••••L88p',
    tokenFull: 'ow_live_sk_33b79f11a00c88de44d722pL88p',
    scope: 'read:sql',
    calls30d: '13.532',
    lastUsed: '3 ngày trước',
    status: 'expiring',
    expiresIn: 'Hết hạn trong 4 ngày',
  },
];

const TRAFFIC_14D = [11.2, 12.8, 10.4, 13.9, 15.2, 14.8, 16.4, 15.9, 17.2, 18.0, 16.8, 19.4, 18.2, 21.5];

export const OpenWorkApiKeysPage: React.FC<OpenWorkApiKeysPageProps> = ({
  onCreateKey,
}) => {
  const [keys, setKeys] = useState<ApiKeyItem[]>(INITIAL_KEYS);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Secret Banner State
  const [newSecret, setNewSecret] = useState<string | null>(
    'ow_live_sk_sec_778f9104b2c3a99e8d103387faK9'
  );
  const [isNewSecretRevealed, setIsNewSecretRevealed] = useState(false);
  const [newSecretCountdown, setNewSecretCountdown] = useState(0);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);

  const newSecretTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keyTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Toggle reveal for table keys with 15s auto-hide timer
  const toggleReveal = useCallback((id: string) => {
    setRevealedKeys((prev) => {
      const currentlyRevealed = Boolean(prev[id]);
      if (currentlyRevealed) {
        if (keyTimersRef.current[id]) {
          clearTimeout(keyTimersRef.current[id]);
          delete keyTimersRef.current[id];
        }
        return { ...prev, [id]: false };
      } else {
        if (keyTimersRef.current[id]) {
          clearTimeout(keyTimersRef.current[id]);
        }
        keyTimersRef.current[id] = setTimeout(() => {
          setRevealedKeys((curr) => ({ ...curr, [id]: false }));
          delete keyTimersRef.current[id];
        }, 15000);
        return { ...prev, [id]: true };
      }
    });
  }, []);

  // Toggle reveal for newly generated secret banner with 15s countdown
  const handleToggleNewSecret = useCallback(() => {
    if (isNewSecretRevealed) {
      setIsNewSecretRevealed(false);
      if (newSecretTimerRef.current) clearInterval(newSecretTimerRef.current);
      setNewSecretCountdown(0);
    } else {
      setIsNewSecretRevealed(true);
      setNewSecretCountdown(15);
      if (newSecretTimerRef.current) clearInterval(newSecretTimerRef.current);
      newSecretTimerRef.current = setInterval(() => {
        setNewSecretCountdown((prev) => {
          if (prev <= 1) {
            setIsNewSecretRevealed(false);
            if (newSecretTimerRef.current) clearInterval(newSecretTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [isNewSecretRevealed]);

  // Window blur listener: Auto-hide all exposed keys immediately
  useEffect(() => {
    const handleBlur = () => {
      setIsNewSecretRevealed(false);
      if (newSecretTimerRef.current) {
        clearInterval(newSecretTimerRef.current);
        newSecretTimerRef.current = null;
      }
      setNewSecretCountdown(0);

      Object.values(keyTimersRef.current).forEach((t) => clearTimeout(t));
      keyTimersRef.current = {};
      setRevealedKeys({});
    };

    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
      if (newSecretTimerRef.current) clearInterval(newSecretTimerRef.current);
      Object.values(keyTimersRef.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  // Safe copy with 30s clipboard auto-wipe
  const copyToClipboard = useCallback((text: string, id: string) => {
    safeCopyToClipboard(text, 30000);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleCopySecret = useCallback(() => {
    if (newSecret) {
      safeCopyToClipboard(newSecret, 30000);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }, [newSecret]);

  const handleCreateNewKey = () => {
    const rawSecret = 'ow_live_sk_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 8);
    const masked = rawSecret.slice(0, 11) + '••••••••••••••••' + rawSecret.slice(-4);
    const newKeyItem: ApiKeyItem = {
      id: `key-${Date.now()}`,
      name: `Khóa API mới #${keys.length + 1}`,
      tokenMasked: masked,
      tokenFull: rawSecret,
      scope: 'read:sql, write:artifacts',
      calls30d: '0',
      lastUsed: 'Chưa dùng',
      status: 'active',
    };
    setKeys((prev) => [newKeyItem, ...prev]);
    setNewSecret(rawSecret);
    setIsNewSecretRevealed(false);
    setNewSecretCountdown(0);
    onCreateKey?.();
  };

  const handleRevokeKey = (id: string) => {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, status: 'revoked' as const } : k))
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            API Key & Quản lý Truy cập
          </span>
          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-md px-1.5 py-0.5 whitespace-nowrap">
            {keys.filter((k) => k.status === 'active').length} khóa hoạt động
          </span>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://docs.dbgpt.site"
            target="_blank"
            rel="noreferrer"
            className="h-6.5 px-2.5 flex items-center gap-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] hover:text-[var(--fg)] rounded-lg text-[0.71875rem] whitespace-nowrap transition-colors"
          >
            <BookOpen size={12} />
            <span>Tài liệu API</span>
          </a>

          <button
            type="button"
            onClick={handleCreateNewKey}
            className="h-6.5 px-2.5 flex items-center gap-1.5 border-0 bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-opacity shadow-xs"
          >
            <Plus size={12} />
            <span>Tạo khóa mới</span>
          </button>
        </div>
      </header>

      {/* ── 2. Scrollable Canvas ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--panel)] p-4 custom-scrollbar">
        <div className="max-w-[1280px] mx-auto flex flex-col gap-4">
          {/* Newly Created Secret Banner */}
          {newSecret && (
            <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-3.5 flex flex-col gap-2.5 shadow-[var(--shadow)] animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <ShieldCheck size={15} />
                  <span className="text-[0.78125rem] font-medium">
                    Khóa bí mật vừa tạo — mặc định ẩn. Hãy sao chép an toàn (tự xóa bộ nhớ tạm sau 30s).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setNewSecret(null)}
                  className="text-[0.6875rem] text-[var(--muted-fg)] hover:text-[var(--fg)] flex items-center gap-1"
                >
                  <span>Đã lưu</span>
                  <X size={12} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-[0.71875rem] bg-[var(--bg)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-[var(--fg)] select-all truncate flex items-center justify-between">
                  <span className="truncate">
                    {isNewSecretRevealed
                      ? newSecret
                      : newSecret.slice(0, 11) + '••••••••••••••••' + newSecret.slice(-4)}
                  </span>
                  {isNewSecretRevealed && newSecretCountdown > 0 && (
                    <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono ml-2 shrink-0">
                      {newSecretCountdown}s
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleToggleNewSecret}
                  title={isNewSecretRevealed ? 'Ẩn khóa' : 'Hiển thị khóa (tự ẩn sau 15 giây)'}
                  className="h-8 px-2.5 flex items-center justify-center border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:bg-[var(--muted)] rounded-lg text-[0.71875rem] shrink-0 transition-colors"
                >
                  {isNewSecretRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  type="button"
                  onClick={handleCopySecret}
                  title="Sao chép an toàn (tự xóa bộ nhớ tạm sau 30s)"
                  className="h-8 px-3 flex items-center gap-1.5 border-0 bg-[var(--primary)] text-[var(--primary-fg)] rounded-lg text-[0.71875rem] font-medium shrink-0 shadow-xs"
                >
                  {copiedSecret ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedSecret ? 'Đã sao chép' : 'Sao chép'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 4 Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Lượt gọi 30 ngày', value: '184.502' },
              { label: 'Tỷ lệ lỗi (4xx/5xx)', value: '0,24%' },
              { label: 'Độ trễ trung vị', value: '312 ms' },
              { label: 'Chi phí tháng này', value: '18,4 tr đ' },
            ].map((st, i) => (
              <div
                key={i}
                className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-3 shadow-[var(--shadow)]"
              >
                <div className="text-[0.6875rem] text-[var(--muted-fg)] truncate">{st.label}</div>
                <div className="font-mono text-[1.1875rem] font-medium tracking-tight text-[var(--fg)] mt-1 tabular-nums">
                  {st.value}
                </div>
              </div>
            ))}
          </div>

          {/* Active Keys Table */}
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--hair)]">
              <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Danh sách khóa API</span>
              <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)]">{keys.length} khóa</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.75rem] border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-[var(--hair)] text-[0.65625rem] uppercase tracking-wider text-[var(--muted-fg)]">
                    <th className="py-2 px-3.5 font-medium">Tên khóa</th>
                    <th className="py-2 px-3.5 font-medium">Mã Token</th>
                    <th className="py-2 px-3.5 font-medium">Phạm vi quyền</th>
                    <th className="py-2 px-3.5 font-medium text-right">Lượt gọi (30d)</th>
                    <th className="py-2 px-3.5 font-medium">Lần cuối</th>
                    <th className="py-2 px-3.5 font-medium">Trạng thái</th>
                    <th className="py-2 px-3.5 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => {
                    const isRevealed = Boolean(revealedKeys[k.id]);
                    const isCopied = copiedId === k.id;
                    const isRevoked = k.status === 'revoked';
                    return (
                      <tr
                        key={k.id}
                        className={cn(
                          'border-b border-[var(--hair)] hover:bg-[var(--muted)]/40 transition-colors',
                          isRevoked && 'opacity-50'
                        )}
                      >
                        <td className="py-2 px-3.5 font-medium text-[var(--fg)] truncate max-w-[160px]">
                          {k.name}
                        </td>
                        <td className="py-2 px-3.5 font-mono text-[0.71875rem] text-[var(--fg2)]">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate max-w-[180px]">
                              {isRevealed ? k.tokenFull : k.tokenMasked}
                            </span>
                            {!isRevoked && (
                              <button
                                type="button"
                                onClick={() => toggleReveal(k.id)}
                                title={isRevealed ? 'Ẩn token' : 'Hiện token'}
                                className="p-0.5 text-[var(--muted-fg)] hover:text-[var(--fg)] rounded"
                              >
                                {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3.5 text-[0.6875rem] text-[var(--muted-fg)]">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)] font-mono">
                            {k.scope}
                          </span>
                        </td>
                        <td className="py-2 px-3.5 text-right font-mono tabular-nums text-[var(--fg2)]">
                          {k.calls30d}
                        </td>
                        <td className="py-2 px-3.5 text-[0.6875rem] text-[var(--muted-fg)] truncate">
                          {k.lastUsed}
                        </td>
                        <td className="py-2 px-3.5">
                          {k.status === 'active' ? (
                            <span className="text-[0.65625rem] px-2 py-0.5 rounded-md font-medium border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                              Hoạt động
                            </span>
                          ) : k.status === 'expiring' ? (
                            <span className="text-[0.65625rem] px-2 py-0.5 rounded-md font-medium border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                              Sắp hết hạn
                            </span>
                          ) : (
                            <span className="text-[0.65625rem] px-2 py-0.5 rounded-md font-medium border bg-zinc-500/10 text-zinc-500 border-zinc-500/20">
                              Đã thu hồi
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!isRevoked && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(k.tokenFull, k.id)}
                                  title="Sao chép token"
                                  className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-fg)] hover:text-[var(--fg)] transition-colors"
                                >
                                  {isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRevokeKey(k.id)}
                                  title="Thu hồi khóa"
                                  className="p-1 rounded hover:bg-rose-500/10 text-[var(--muted-fg)] hover:text-rose-500 transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Grid: 14-day Traffic + Rate Limits */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3">
            {/* 14-day traffic */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-2 mb-2">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Lưu lượng gọi 14 ngày qua</span>
                <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)]">TB: 15.6k req/ngày</span>
              </div>
              <div className="pt-2">
                <svg viewBox="0 0 420 100" className="w-full h-auto block">
                  <g stroke="var(--hair)" strokeWidth="1">
                    <line x1="10" y1="20" x2="410" y2="20" />
                    <line x1="10" y1="50" x2="410" y2="50" />
                    <line x1="10" y1="80" x2="410" y2="80" />
                  </g>
                  {TRAFFIC_14D.map((v, idx) => {
                    const h = v * 3.4;
                    const x = 16 + idx * 28;
                    return (
                      <g key={idx}>
                        <rect
                          x={x}
                          y={80 - h}
                          width="16"
                          height={h}
                          rx="2"
                          fill="var(--c2)"
                          style={{
                            animation: 'ow-grow 0.5s ease both',
                            transformOrigin: `0 80px`,
                          }}
                        />
                        <text
                          x={x + 8}
                          y="94"
                          fontSize="8.5"
                          fontFamily="Geist Mono, monospace"
                          fill="var(--muted-fg)"
                          textAnchor="middle"
                        >
                          {idx + 1}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Rate limits */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-[var(--hair)] pb-2 mb-2">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">Hạn mức tỷ lệ (Rate Limits)</span>
                <span className="text-[0.65625rem] text-[var(--ok)]">Bình thường</span>
              </div>

              <div className="flex flex-col gap-3 py-1">
                <div>
                  <div className="flex items-center justify-between text-[0.6875rem] mb-1">
                    <span className="text-[var(--muted-fg)]">Yêu cầu mỗi phút (RPM)</span>
                    <span className="font-mono text-[var(--fg2)]">420 / 600 RPM</span>
                  </div>
                  <div className="h-2 w-full bg-[var(--muted)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--c2)] rounded-full" style={{ width: '70%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[0.6875rem] mb-1">
                    <span className="text-[var(--muted-fg)]">Token mỗi phút (TPM)</span>
                    <span className="font-mono text-[var(--fg2)]">840k / 1.2M TPM</span>
                  </div>
                  <div className="h-2 w-full bg-[var(--muted)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--c3)] rounded-full" style={{ width: '68%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[0.6875rem] mb-1">
                    <span className="text-[var(--muted-fg)]">Truy vấn SQL đồng thời</span>
                    <span className="font-mono text-[var(--fg2)]">8 / 12 phiên</span>
                  </div>
                  <div className="h-2 w-full bg-[var(--muted)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--c1)] rounded-full" style={{ width: '66%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenWorkApiKeysPage;
