import { UserInfoResponse } from '@/types/userinfo';
import { safeJsonParse } from '@/utils';
import { STORAGE_USERINFO_KEY } from '@/utils/constants/index';

const useUser = (): UserInfoResponse | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return safeJsonParse<UserInfoResponse | null>(localStorage.getItem(STORAGE_USERINFO_KEY), null);
};

export default useUser;

