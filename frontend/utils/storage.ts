import { STORAGE_INIT_MESSAGE_KET, STORAGE_USERINFO_KEY } from './constants/index';
import { safeJsonParse } from './json';

export function getInitMessage() {
  if (typeof window === 'undefined') return null;
  return safeJsonParse<{ id: string; message: string } | null>(
    localStorage.getItem(STORAGE_INIT_MESSAGE_KET),
    null,
  );
}

export function getUserId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const userInfo = safeJsonParse<Record<string, any> | null>(
    localStorage.getItem(STORAGE_USERINFO_KEY),
    null,
  );
  return userInfo?.user_id;
}

