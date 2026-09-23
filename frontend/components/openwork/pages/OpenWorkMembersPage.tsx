import React, { useState, useMemo } from 'react';
import { Users, UserPlus, Search, Shield, Check, Mail, Clock, RefreshCw, X, ShieldAlert, ChevronRight, AlertTriangle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRBAC } from '@/hooks/useRBAC';
import { DoubleConfirmModal } from '@/components/security/DoubleConfirmModal';

export interface OpenWorkMembersPageProps {
  onInvite?: () => void;
}

export type RoleType = 'Quản trị' | 'Biên tập' | 'Phân tích' | 'Chỉ xem';

export interface MemberItem {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: RoleType;
  scope: string;
  lastActive: string;
  status: 'active' | 'disabled';
}

export interface PendingInvite {
  id: string;
  email: string;
  role: RoleType;
  sentAt: string;
}

const ROLES_ORDER: RoleType[] = ['Quản trị', 'Biên tập', 'Phân tích', 'Chỉ xem'];

const ROLE_DESCRIPTIONS: Record<RoleType, string> = {
  'Quản trị': 'Toàn quyền quản trị hệ thống, quản lý thành viên, thu hồi API key, cấu hình thanh toán và xóa phiên.',
  'Biên tập': 'Quyền tạo và chạy SQL, phân tích Python Sandbox, cấu hình nguồn dữ liệu và xuất báo cáo.',
  'Phân tích': 'Quyền chạy truy vấn SQL, phân tích dữ liệu và xuất bảng tính Excel/PDF.',
  'Chỉ xem': 'Chỉ có quyền xem các báo cáo đã tạo, không được chạy truy vấn SQL hoặc thay đổi cấu hình.',
};

const ROLE_COLORS: Record<RoleType, { bg: string; text: string; dot: string }> = {
  'Quản trị': { bg: 'bg-rose-500/10 border-rose-500/20', text: 'text-rose-600 dark:text-rose-400', dot: 'bg-rose-500' },
  'Biên tập': { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  'Phân tích': { bg: 'bg-sky-500/10 border-sky-500/20', text: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-500' },
  'Chỉ xem': { bg: 'bg-zinc-500/10 border-zinc-500/20', text: 'text-zinc-600 dark:text-zinc-400', dot: 'bg-zinc-400' },
};

const INITIAL_MEMBERS: MemberItem[] = [
  {
    id: 'm1',
    name: 'Vũ Hoàng Anh',
    email: 'anh.vh@congty.vn',
    initials: 'VA',
    role: 'Quản trị',
    scope: 'Tất cả nguồn dữ liệu',
    lastActive: 'Vừa xong (09:41)',
    status: 'active',
  },
  {
    id: 'm2',
    name: 'Nguyễn Minh Trang',
    email: 'trang.nm@congty.vn',
    initials: 'MT',
    role: 'Biên tập',
    scope: 'Kho phân tích, Đơn hàng',
    lastActive: '10 phút trước',
    status: 'active',
  },
  {
    id: 'm3',
    name: 'Lê Tuấn Kiệt',
    email: 'kiet.lt@congty.vn',
    initials: 'LK',
    role: 'Phân tích',
    scope: 'Kho phân tích, Sự kiện',
    lastActive: 'Hôm qua 16:30',
    status: 'active',
  },
  {
    id: 'm4',
    name: 'Trần Bảo Ngọc',
    email: 'ngoc.tb@congty.vn',
    initials: 'BN',
    role: 'Phân tích',
    scope: 'Kho phân tích, ERP',
    lastActive: 'Hôm qua 14:15',
    status: 'active',
  },
  {
    id: 'm5',
    name: 'Phạm Đức Duy',
    email: 'duy.pd@congty.vn',
    initials: 'DD',
    role: 'Chỉ xem',
    scope: 'Báo cáo doanh thu',
    lastActive: '3 ngày trước',
    status: 'active',
  },
  {
    id: 'm6',
    name: 'Đặng Mai Linh',
    email: 'linh.dm@congty.vn',
    initials: 'ML',
    role: 'Chỉ xem',
    scope: 'Báo cáo doanh thu',
    lastActive: '5 ngày trước',
    status: 'active',
  },
];

const INITIAL_INVITES: PendingInvite[] = [
  { id: 'inv-1', email: 'hoang.nam@congty.vn', role: 'Phân tích', sentAt: '08:30 hôm nay' },
  { id: 'inv-2', email: 'audit-partner@kpmg.com.vn', role: 'Chỉ xem', sentAt: 'Hôm qua' },
  { id: 'inv-3', email: 'quoc.bao@congty.vn', role: 'Biên tập', sentAt: '3 ngày trước' },
];

const PERMISSIONS_MATRIX = [
  { feature: 'Tạo & chạy câu truy vấn SQL', admin: true, editor: true, analyst: true, viewer: false },
  { feature: 'Xuất file Excel / PPT / Word', admin: true, editor: true, analyst: true, viewer: true },
  { feature: 'Chạy Python Sandbox phân tích', admin: true, editor: true, analyst: true, viewer: false },
  { feature: 'Quản lý & kết nối Nguồn dữ liệu', admin: true, editor: true, analyst: false, viewer: false },
  { feature: 'Cấu hình API Key & MCP Tools', admin: true, editor: false, analyst: false, viewer: false },
  { feature: 'Mời thành viên & chỉnh phân quyền', admin: true, editor: false, analyst: false, viewer: false },
  { feature: 'Xem nhật ký kiểm toán hệ thống', admin: true, editor: false, analyst: false, viewer: false },
  { feature: 'Quản lý thanh toán & nâng gói', admin: true, editor: false, analyst: false, viewer: false },
  { feature: 'Xóa vĩnh viễn phiên làm việc', admin: true, editor: true, analyst: false, viewer: false },
];

export const OpenWorkMembersPage: React.FC<OpenWorkMembersPageProps> = ({
  onInvite,
}) => {
  // RBAC permissions hook
  const { role: currentActorRole, canManageMembers, canAdmin } = useRBAC();

  const [members, setMembers] = useState<MemberItem[]>(INITIAL_MEMBERS);
  const [invites, setInvites] = useState<PendingInvite[]>(INITIAL_INVITES);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('Tất cả');

  // Modal States
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteEmails, setInviteEmails] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<RoleType>('Phân tích');

  // RBAC Double Confirmation State
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    member: MemberItem;
    nextRole: RoleType;
  } | null>(null);

  const [pendingRevokeInvite, setPendingRevokeInvite] = useState<PendingInvite | null>(null);

  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  const handleRolePillClick = (member: MemberItem) => {
    if (!canManageMembers) {
      setPermissionNotice('Chỉ Quản trị viên mới có quyền thay đổi vai trò thành viên.');
      setTimeout(() => setPermissionNotice(null), 3500);
      return;
    }

    const currentIdx = ROLES_ORDER.indexOf(member.role);
    const nextRole = ROLES_ORDER[(currentIdx + 1) % ROLES_ORDER.length];
    setPendingRoleChange({ member, nextRole });
  };

  const confirmRoleChange = () => {
    if (!pendingRoleChange) return;
    const { member, nextRole } = pendingRoleChange;

    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== member.id) return m;
        return { ...m, role: nextRole };
      })
    );
    setPendingRoleChange(null);
  };

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchRole = selectedRoleFilter === 'Tất cả' || m.role === selectedRoleFilter;
      return matchSearch && matchRole;
    });
  }, [members, searchQuery, selectedRoleFilter]);

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMembers) {
      setPermissionNotice('Chỉ Quản trị viên mới có quyền gửi lời mời thành viên.');
      setTimeout(() => setPermissionNotice(null), 3500);
      return;
    }
    if (!inviteEmails.trim()) return;
    const emailList = inviteEmails.split(/[,;\n]+/).map((e) => e.trim()).filter(Boolean);
    const newInvites: PendingInvite[] = emailList.map((email, idx) => ({
      id: `inv-${Date.now()}-${idx}`,
      email,
      role: inviteRole,
      sentAt: 'Vừa xong',
    }));
    setInvites((prev) => [...newInvites, ...prev]);
    setShowInviteModal(false);
    setInviteEmails('');
    onInvite?.();
  };

  const confirmRevokeInvite = () => {
    if (!pendingRevokeInvite) return;
    setInvites((prev) => prev.filter((i) => i.id !== pendingRevokeInvite.id));
    setPendingRevokeInvite(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--bg)] text-[var(--fg)] select-none">
      {/* ── 1. Top Header Bar (44px) ── */}
      <header className="h-[44px] flex-none flex items-center justify-between gap-2 px-3.5 border-b border-[var(--border)] bg-[var(--bg)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[0.78125rem] font-medium tracking-tight text-[var(--fg)] whitespace-nowrap">
            Thành viên & phân quyền
          </span>
          <span className="font-mono text-[0.65625rem] text-[var(--muted-fg)] border border-[var(--border)] rounded-md px-1.5 py-0.5 whitespace-nowrap">
            {members.length} người · {invites.length} lời mời
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Permission notice banner if triggered */}
          {permissionNotice && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-lg text-[0.6875rem] font-medium animate-in fade-in">
              <AlertTriangle size={12} />
              <span>{permissionNotice}</span>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1.5 text-[var(--muted-fg)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên, email…"
              className="w-36 sm:w-48 h-6.5 pl-7 pr-2.5 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--muted-fg)] rounded-lg text-[0.71875rem] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            type="button"
            disabled={!canManageMembers}
            onClick={() => {
              if (canManageMembers) {
                setShowInviteModal(true);
              } else {
                setPermissionNotice('Chỉ Quản trị viên mới có quyền mời thành viên.');
                setTimeout(() => setPermissionNotice(null), 3500);
              }
            }}
            title={canManageMembers ? 'Mời thành viên mới' : 'Yêu cầu quyền Quản trị viên để mời thành viên'}
            className={cn(
              'h-6.5 px-2.5 flex items-center gap-1.5 border-0 rounded-lg text-[0.71875rem] font-medium whitespace-nowrap transition-all shadow-xs',
              canManageMembers
                ? 'bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 cursor-pointer'
                : 'bg-[var(--muted)] text-[var(--muted-fg)] cursor-not-allowed opacity-60'
            )}
          >
            {canManageMembers ? <UserPlus size={12} /> : <Lock size={12} />}
            <span>Mời thành viên</span>
          </button>
        </div>
      </header>

      {/* ── 2. Scrollable Canvas ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--panel)] p-4 custom-scrollbar">
        <div className="max-w-[1280px] mx-auto flex flex-col gap-4">
          {/* 4 Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Thành viên hoạt động', value: `${members.length} tài khoản` },
              { label: 'Quản trị viên', value: '1 thành viên' },
              { label: 'Phiên phân tích tháng này', value: '148 phiên' },
              { label: 'Đăng nhập SSO công ty', value: '87% bảo mật' },
            ].map((st, i) => (
              <div
                key={i}
                className="border border-[var(--border)] bg-[var(--card)] rounded-xl p-3 shadow-[var(--shadow)]"
              >
                <div className="text-[0.6875rem] text-[var(--muted-fg)] truncate">{st.label}</div>
                <div className="font-mono text-[1.125rem] font-medium tracking-tight text-[var(--fg)] mt-1 tabular-nums">
                  {st.value}
                </div>
              </div>
            ))}
          </div>

          {/* Members Table */}
          <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden flex flex-col">
            <div className="p-3 border-b border-[var(--hair)] flex items-center justify-between gap-3 flex-wrap">
              {/* Role filter buttons */}
              <div className="flex items-center gap-1">
                {['Tất cả', 'Quản trị', 'Biên tập', 'Phân tích', 'Chỉ xem'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRoleFilter(r)}
                    className={cn(
                      'h-6 px-2.5 rounded-md text-[0.71875rem] transition-colors',
                      selectedRoleFilter === r
                        ? 'bg-[var(--primary)] text-[var(--primary-fg)] font-medium shadow-xs'
                        : 'text-[var(--muted-fg)] hover:text-[var(--fg)] hover:bg-[var(--muted)]'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <div className="text-[0.6875rem] text-[var(--muted-fg)]">
                {canManageMembers
                  ? 'Nhấp vào vai trò để đổi quyền hạn (yêu cầu xác nhận)'
                  : 'Chỉ Quản trị viên mới có thể thay đổi phân quyền'}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[0.75rem] border-collapse min-w-[640px]">
                <thead>
                  <tr className="border-b border-[var(--hair)] text-[0.65625rem] uppercase tracking-wider text-[var(--muted-fg)]">
                    <th className="py-2 px-3.5 font-medium">Thành viên</th>
                    <th className="py-2 px-3.5 font-medium">Vai trò</th>
                    <th className="py-2 px-3.5 font-medium">Phạm vi dữ liệu</th>
                    <th className="py-2 px-3.5 font-medium">Hoạt động gần nhất</th>
                    <th className="py-2 px-3.5 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[var(--muted-fg)] text-[0.75rem]">
                        Không tìm thấy thành viên phù hợp
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m) => {
                      const color = ROLE_COLORS[m.role];
                      return (
                        <tr
                          key={m.id}
                          className="border-b border-[var(--hair)] hover:bg-[var(--muted)]/40 transition-colors"
                        >
                          <td className="py-2 px-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center font-semibold text-[0.6875rem] text-[var(--fg)] shrink-0">
                                {m.initials}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium text-[var(--fg)] truncate">
                                  {m.name}
                                </div>
                                <div className="font-mono text-[0.65625rem] text-[var(--muted-fg)] truncate">
                                  {m.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-2 px-3.5">
                            {/* Interactive Role Change Pill with RBAC Double Confirmation */}
                            <button
                              type="button"
                              onClick={() => handleRolePillClick(m)}
                              title={
                                canManageMembers
                                  ? `Đổi vai trò của ${m.name}`
                                  : 'Chỉ Quản trị viên mới có quyền đổi vai trò'
                              }
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[0.6875rem] font-medium transition-all',
                                color.bg,
                                color.text,
                                canManageMembers
                                  ? 'cursor-pointer active:scale-95 hover:brightness-105'
                                  : 'cursor-not-allowed opacity-80'
                              )}
                            >
                              <span className={cn('w-1.5 h-1.5 rounded-full', color.dot)} />
                              <span>{m.role}</span>
                              {!canManageMembers && <Lock size={10} className="ml-0.5 opacity-60" />}
                            </button>
                          </td>

                          <td className="py-2 px-3.5 text-[0.71875rem] text-[var(--fg2)] truncate max-w-[200px]">
                            {m.scope}
                          </td>

                          <td className="py-2 px-3.5 text-[0.6875rem] text-[var(--muted-fg)] font-mono">
                            {m.lastActive}
                          </td>

                          <td className="py-2 px-3.5">
                            <span className="text-[0.65625rem] px-2 py-0.5 rounded-md font-medium border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                              Đang hoạt động
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Split: Permission Matrix + Pending Invites */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3 items-start">
            {/* Permission Matrix */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden">
              <div className="p-3 border-b border-[var(--hair)] flex items-center justify-between">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">
                  Ma trận phân quyền chi tiết
                </span>
                <span className="text-[0.6875rem] text-[var(--muted-fg)]">4 cấp bậc vai trò</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[0.71875rem] border-collapse min-w-[480px]">
                  <thead>
                    <tr className="border-b border-[var(--hair)] text-[0.625rem] uppercase tracking-wider text-[var(--muted-fg)]">
                      <th className="py-2 px-3 font-medium">Quyền hạn hệ thống</th>
                      <th className="py-2 px-2 text-center font-medium">Quản trị</th>
                      <th className="py-2 px-2 text-center font-medium">Biên tập</th>
                      <th className="py-2 px-2 text-center font-medium">Phân tích</th>
                      <th className="py-2 px-2 text-center font-medium">Chỉ xem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS_MATRIX.map((p, i) => (
                      <tr
                        key={i}
                        className="border-b border-[var(--hair)] hover:bg-[var(--muted)]/30 transition-colors"
                      >
                        <td className="py-1.5 px-3 text-[var(--fg)] truncate max-w-[200px]">
                          {p.feature}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono">
                          {p.admin ? <span className="text-[var(--ok)]">✓</span> : <span className="text-[var(--muted-fg)]">—</span>}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono">
                          {p.editor ? <span className="text-[var(--ok)]">✓</span> : <span className="text-[var(--muted-fg)]">—</span>}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono">
                          {p.analyst ? <span className="text-[var(--ok)]">✓</span> : <span className="text-[var(--muted-fg)]">—</span>}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono">
                          {p.viewer ? <span className="text-[var(--ok)]">✓</span> : <span className="text-[var(--muted-fg)]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pending Invites List */}
            <div className="border border-[var(--border)] bg-[var(--card)] rounded-xl shadow-[var(--shadow)] overflow-hidden">
              <div className="p-3 border-b border-[var(--hair)] flex items-center justify-between">
                <span className="text-[0.78125rem] font-medium text-[var(--fg)]">
                  Lời mời đang chờ ({invites.length})
                </span>
                <span className="text-[0.6875rem] text-[var(--muted-fg)]">Hết hạn sau 7 ngày</span>
              </div>

              <div className="p-3 flex flex-col gap-2">
                {invites.length === 0 ? (
                  <div className="p-4 text-center text-[var(--muted-fg)] text-[0.75rem]">
                    Không có lời mời nào đang chờ
                  </div>
                ) : (
                  invites.map((inv) => (
                    <div
                      key={inv.id}
                      className="border border-[var(--hair)] rounded-lg p-2.5 flex items-center justify-between gap-2 bg-[var(--panel)]/40"
                    >
                      <div className="min-w-0">
                        <div className="text-[0.75rem] font-medium text-[var(--fg)] truncate">
                          {inv.email}
                        </div>
                        <div className="flex items-center gap-2 text-[0.65625rem] text-[var(--muted-fg)] mt-0.5">
                          <span className="font-mono">{inv.role}</span>
                          <span>·</span>
                          <span>{inv.sentAt}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {}}
                          disabled={!canManageMembers}
                          title={canManageMembers ? 'Gửi lại email mời' : 'Chỉ Quản trị viên mới có quyền gửi lại'}
                          className={cn(
                            'h-6 px-2 text-[0.6875rem] border border-[var(--border)] bg-[var(--card)] rounded-md text-[var(--fg2)]',
                            canManageMembers ? 'hover:bg-[var(--muted)] cursor-pointer' : 'opacity-60 cursor-not-allowed'
                          )}
                        >
                          Gửi lại
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (canManageMembers) {
                              setPendingRevokeInvite(inv);
                            } else {
                              setPermissionNotice('Chỉ Quản trị viên mới có quyền thu hồi lời mời.');
                              setTimeout(() => setPermissionNotice(null), 3500);
                            }
                          }}
                          disabled={!canManageMembers}
                          title={canManageMembers ? 'Thu hồi lời mời' : 'Chỉ Quản trị viên mới có quyền thu hồi'}
                          className={cn(
                            'h-6 px-2 text-[0.6875rem] text-rose-600 dark:text-rose-400 rounded-md',
                            canManageMembers ? 'hover:bg-rose-500/10 cursor-pointer' : 'opacity-60 cursor-not-allowed'
                          )}
                        >
                          Thu hồi
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Invite Member Modal ── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-[480px] bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[var(--hair)] pb-3">
              <div className="flex items-center gap-2">
                <UserPlus size={16} className="text-[var(--accent)]" />
                <h3 className="text-[0.875rem] font-medium text-[var(--fg)]">
                  Mời thành viên vào tổ chức
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-[var(--muted-fg)] hover:text-[var(--fg)] p-1 rounded-md"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="flex flex-col gap-3.5">
              <div>
                <label className="text-[0.71875rem] font-medium text-[var(--muted-fg)] block mb-1">
                  Địa chỉ email (ngăn cách bằng dấu phẩy hoặc xuống dòng)
                </label>
                <textarea
                  rows={3}
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  placeholder="nhan-vien@congty.vn, audit@partner.vn"
                  className="w-full p-2.5 bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)] rounded-lg text-[0.75rem] outline-none focus:border-[var(--accent)] resize-none"
                />
              </div>

              <div>
                <label className="text-[0.71875rem] font-medium text-[var(--muted-fg)] block mb-2">
                  Chọn vai trò mặc định
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES_ORDER.map((r) => {
                    const isRSelected = inviteRole === r;
                    return (
                      <div
                        key={r}
                        onClick={() => setInviteRole(r)}
                        className={cn(
                          'p-2.5 rounded-lg border cursor-pointer transition-all flex items-center gap-2',
                          isRSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]/20 ring-1 ring-[var(--accent)]'
                            : 'border-[var(--border)] hover:bg-[var(--muted)]'
                        )}
                      >
                        <div
                          className={cn(
                            'w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0',
                            isRSelected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--muted-fg)]'
                          )}
                        >
                          {isRSelected && <Check size={9} className="text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[0.75rem] font-medium text-[var(--fg)] truncate">{r}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--hair)]">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="h-7 px-3 border border-[var(--border)] bg-[var(--card)] text-[var(--fg2)] hover:bg-[var(--muted)] rounded-lg text-[0.71875rem]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="h-7 px-4 border-0 bg-[var(--primary)] text-[var(--primary-fg)] rounded-lg text-[0.71875rem] font-medium shadow-xs"
                >
                  Gửi lời mời
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 4. RBAC Double Confirmation: Role Change Modal ── */}
      {pendingRoleChange && (
        <DoubleConfirmModal
          open={Boolean(pendingRoleChange)}
          onOpenChange={(open) => {
            if (!open) setPendingRoleChange(null);
          }}
          title="Xác nhận thay đổi phân quyền thành viên"
          actionName="Đổi vai trò thành viên"
          actionLabel="Đổi phân quyền"
          tier={pendingRoleChange.member.role === 'Quản trị' || pendingRoleChange.nextRole === 'Quản trị' ? 2 : 1}
          requiredPhrase={
            pendingRoleChange.member.role === 'Quản trị' || pendingRoleChange.nextRole === 'Quản trị'
              ? 'CHANGE_ROLE'
              : undefined
          }
          variant={pendingRoleChange.nextRole === 'Quản trị' ? 'warning' : 'danger'}
          description={
            <span>
              Bạn đang chuẩn bị thay đổi vai trò của <strong>{pendingRoleChange.member.name}</strong> ({pendingRoleChange.member.email}) từ{' '}
              <strong className="text-rose-600 dark:text-rose-400">{pendingRoleChange.member.role}</strong> sang{' '}
              <strong className="text-sky-600 dark:text-sky-400">{pendingRoleChange.nextRole}</strong>.
            </span>
          }
          impactSummary={
            <div className="space-y-1.5">
              <div className="font-semibold text-[var(--fg)]">Phạm vi quyền hạn mới:</div>
              <div>{ROLE_DESCRIPTIONS[pendingRoleChange.nextRole]}</div>
            </div>
          }
          onConfirm={confirmRoleChange}
          onCancel={() => setPendingRoleChange(null)}
        />
      )}

      {/* ── 5. RBAC Double Confirmation: Revoke Invite Modal ── */}
      {pendingRevokeInvite && (
        <DoubleConfirmModal
          open={Boolean(pendingRevokeInvite)}
          onOpenChange={(open) => {
            if (!open) setPendingRevokeInvite(null);
          }}
          title="Thu hồi lời mời tham gia tổ chức"
          actionName="Thu hồi lời mời"
          actionLabel="Xác nhận thu hồi"
          tier={1}
          variant="danger"
          description={
            <span>
              Bạn có chắc chắn muốn thu hồi lời mời gửi tới <strong>{pendingRevokeInvite.email}</strong> với vai trò{' '}
              <strong>{pendingRevokeInvite.role}</strong>? Người nhận sẽ không thể sử dụng liên kết mời đã gửi.
            </span>
          }
          onConfirm={confirmRevokeInvite}
          onCancel={() => setPendingRevokeInvite(null)}
        />
      )}
    </div>
  );
};

export default OpenWorkMembersPage;
