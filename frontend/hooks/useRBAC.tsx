import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';

export type Role = 'admin' | 'editor' | 'viewer';
export type SystemRole = Role;
export type LocalizedRole = 'Quản trị' | 'Biên tập' | 'Phân tích' | 'Chỉ xem';

export type ActionType =
  | 'canManageMembers'
  | 'canRevokeTokens'
  | 'canRevokeKeys'
  | 'canEditSettings'
  | 'canEdit'
  | 'canAdmin'
  | 'canExecuteSQL'
  | 'canViewOnly'
  | 'canDeleteProject'
  | 'canDeleteSession'
  | 'canPurgeLogs'
  | 'canModifyBilling'
  | 'canExportLogs'
  | 'manage_members'
  | 'revoke_tokens'
  | 'revoke_keys'
  | 'edit_settings'
  | 'execute_sql'
  | 'view_only'
  | 'delete_project'
  | 'delete_session'
  | 'purge_logs'
  | 'modify_billing'
  | 'export_logs'
  | 'change_role'
  | 'invite_member';

export interface RBACPermissions {
  canManageMembers: boolean;
  canRevokeTokens: boolean;
  canRevokeKeys: boolean;
  canEditSettings: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  canExecuteSQL: boolean;
  canViewOnly: boolean;
  canDeleteProject: boolean;
  canDeleteSession: boolean;
  canPurgeLogs: boolean;
  canModifyBilling: boolean;
  canExportLogs: boolean;
}

export const PERMISSIONS_MATRIX: Record<Role, RBACPermissions> = {
  admin: {
    canManageMembers: true,
    canRevokeTokens: true,
    canRevokeKeys: true,
    canEditSettings: true,
    canEdit: true,
    canAdmin: true,
    canExecuteSQL: true,
    canViewOnly: false,
    canDeleteProject: true,
    canDeleteSession: true,
    canPurgeLogs: true,
    canModifyBilling: true,
    canExportLogs: true,
  },
  editor: {
    canManageMembers: false,
    canRevokeTokens: false,
    canRevokeKeys: false,
    canEditSettings: true,
    canEdit: true,
    canAdmin: false,
    canExecuteSQL: true,
    canViewOnly: false,
    canDeleteProject: false,
    canDeleteSession: false,
    canPurgeLogs: false,
    canModifyBilling: false,
    canExportLogs: true,
  },
  viewer: {
    canManageMembers: false,
    canRevokeTokens: false,
    canRevokeKeys: false,
    canEditSettings: false,
    canEdit: false,
    canAdmin: false,
    canExecuteSQL: false,
    canViewOnly: true,
    canDeleteProject: false,
    canDeleteSession: false,
    canPurgeLogs: false,
    canModifyBilling: false,
    canExportLogs: false,
  },
};

/**
 * Normalizes input role string to canonical 'admin' | 'editor' | 'viewer'
 */
export function normalizeRole(role?: string | null): Role {
  if (!role) return 'viewer';
  const r = role.toString().trim().toLowerCase();
  if (r === 'admin' || r === 'quản trị' || r === 'quantri' || r === 'owner' || r === 'administrator') {
    return 'admin';
  }
  if (r === 'editor' || r === 'biên tập' || r === 'bientap' || r === 'analyst' || r === 'phân tích' || r === 'phantich') {
    return 'editor';
  }
  return 'viewer';
}

/**
 * Normalizes action string to canonical permission property name
 */
export function normalizeAction(action: string): keyof RBACPermissions {
  const a = action.trim();
  switch (a) {
    case 'manage_members':
    case 'change_role':
    case 'invite_member':
    case 'canManageMembers':
      return 'canManageMembers';
    case 'revoke_tokens':
    case 'revoke_keys':
    case 'canRevokeTokens':
    case 'canRevokeKeys':
      return 'canRevokeTokens';
    case 'edit_settings':
    case 'canEditSettings':
    case 'canEdit':
      return 'canEditSettings';
    case 'execute_sql':
    case 'canExecuteSQL':
      return 'canExecuteSQL';
    case 'view_only':
    case 'canViewOnly':
      return 'canViewOnly';
    case 'delete_project':
    case 'delete_session':
    case 'canDeleteProject':
    case 'canDeleteSession':
      return 'canDeleteProject';
    case 'purge_logs':
    case 'canPurgeLogs':
      return 'canPurgeLogs';
    case 'modify_billing':
    case 'canModifyBilling':
      return 'canModifyBilling';
    case 'export_logs':
    case 'canExportLogs':
      return 'canExportLogs';
    default:
      if (a in PERMISSIONS_MATRIX.admin) {
        return a as keyof RBACPermissions;
      }
      return 'canViewOnly';
  }
}

/**
 * Evaluates whether a role has permission for a specific action.
 * Supports both `hasPermission(role, action)` and `hasPermission(action, role)` invocation styles.
 */
export function hasPermission(arg1: Role | string, arg2: Role | string): boolean {
  const roleKeywords = ['admin', 'editor', 'viewer', 'quản trị', 'biên tập', 'phân tích', 'chỉ xem'];
  let role: Role;
  let action: string;

  if (roleKeywords.includes(String(arg1).toLowerCase())) {
    role = normalizeRole(String(arg1));
    action = String(arg2);
  } else {
    action = String(arg1);
    role = normalizeRole(String(arg2));
  }

  const normalizedActionKey = normalizeAction(action);
  const rolePermissions = PERMISSIONS_MATRIX[role] || PERMISSIONS_MATRIX.viewer;
  return Boolean(rolePermissions[normalizedActionKey]);
}

export interface RBACContextValue extends RBACPermissions {
  role: Role;
  setRole: (role: Role) => void;
  hasPermission: (action: ActionType | string) => boolean;
  isAllowed: (action: ActionType | string) => boolean;
}

export const RBACContext = createContext<RBACContextValue | null>(null);

const STORAGE_KEY = 'openwork:rbac_role';

export interface RBACProviderProps {
  children: React.ReactNode;
  initialRole?: Role;
}

export const RBACProvider: React.FC<RBACProviderProps> = ({
  children,
  initialRole = 'admin',
}) => {
  const [role, setRoleState] = useState<Role>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return normalizeRole(stored);
      } catch {
        // Ignore storage access errors
      }
    }
    return initialRole;
  });

  const setRole = useCallback((newRole: Role) => {
    const normalized = normalizeRole(newRole);
    setRoleState(normalized);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, normalized);
      } catch {
        // Ignore storage access errors
      }
    }
  }, []);

  const permissions = useMemo(() => PERMISSIONS_MATRIX[role] || PERMISSIONS_MATRIX.viewer, [role]);

  const checkPermission = useCallback(
    (action: ActionType | string) => hasPermission(role, action),
    [role]
  );

  const value = useMemo<RBACContextValue>(() => ({
    role,
    setRole,
    ...permissions,
    hasPermission: checkPermission,
    isAllowed: checkPermission,
  }), [role, setRole, permissions, checkPermission]);

  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>;
};

/**
 * Main RBAC hook.
 * Reads from RBACContext if wrapped, or provides standalone fallback state.
 */
export function useRBAC(fallbackRole: Role = 'admin'): RBACContextValue {
  const context = useContext(RBACContext);
  const [localRole, setLocalRole] = useState<Role>(fallbackRole);

  useEffect(() => {
    if (!context && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) setLocalRole(normalizeRole(stored));
      } catch {
        // Ignore storage access errors
      }
    }
  }, [context]);

  if (context) {
    return context;
  }

  const role = localRole;
  const permissions = PERMISSIONS_MATRIX[role] || PERMISSIONS_MATRIX.viewer;

  const setRole = (newRole: Role) => {
    const normalized = normalizeRole(newRole);
    setLocalRole(normalized);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, normalized);
      } catch {
        // Ignore storage access errors
      }
    }
  };

  const checkPermission = (action: ActionType | string) => hasPermission(role, action);

  return {
    role,
    setRole,
    ...permissions,
    hasPermission: checkPermission,
    isAllowed: checkPermission,
  };
}

export default useRBAC;
