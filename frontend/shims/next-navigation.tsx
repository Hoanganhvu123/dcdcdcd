/**
 * `next/navigation` over react-router.
 *
 * The app uses `useSearchParams` (17 sites) and `useRouter` (1). Next's
 * `useSearchParams` returns the params object directly; react-router's returns
 * a `[params, setParams]` tuple, so unwrap it.
 */
import { useSearchParams as useRouterSearchParams } from 'react-router-dom';

export { useRouter } from './next-router';

export function useSearchParams(): URLSearchParams {
  const [searchParams] = useRouterSearchParams();
  return searchParams;
}
