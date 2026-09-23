/**
 * `next/router` over react-router.
 *
 * Aliased in vite.config.ts so the ~35 call sites that import `useRouter` from
 * 'next/router' keep working unchanged. The surface here is exactly what the
 * app uses — push, pathname, query, replace, isReady, isFallback, back, events —
 * not a general Next compatibility layer.
 */
import { useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

export type Query = Record<string, string | string[] | undefined>;

export interface UrlObject {
  auth?: string | null;
  hash?: string | null;
  host?: string | null;
  hostname?: string | null;
  href?: string | null;
  pathname?: string | null;
  protocol?: string | null;
  search?: string | null;
  slashes?: boolean | null;
  port?: string | number | null;
  query?: string | null | Record<string, any>;
}

export type TransitionOptions = {
  shallow?: boolean;
  locale?: string | false;
  scroll?: boolean;
  unstable_skipClientCache?: boolean;
};

export interface RouterEvents {
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
  emit: (event: string, ...args: any[]) => void;
}

/**
 * Converts a string URL or Next.js UrlObject ({ pathname, query, hash }) into a valid URL string.
 */
export function toHref(url: string | UrlObject): string {
  if (typeof url === 'string') {
    return url;
  }
  if (!url || typeof url !== 'object') {
    return '';
  }

  let pathname = url.pathname ?? '';
  let hashStr = '';

  if (url.hash) {
    hashStr = url.hash.startsWith('#') ? url.hash : `#${url.hash}`;
  }

  if (pathname.includes('#')) {
    const [p, h] = pathname.split('#', 2);
    pathname = p;
    if (!hashStr && h !== undefined) {
      hashStr = `#${h}`;
    }
  }

  const searchParams = new URLSearchParams();

  if (pathname.includes('?')) {
    const [p, qs] = pathname.split('?', 2);
    pathname = p;
    const initialParams = new URLSearchParams(qs);
    for (const [k, v] of initialParams.entries()) {
      searchParams.append(k, v);
    }
  }

  if (url.search) {
    const s = url.search.startsWith('?') ? url.search.slice(1) : url.search;
    const extraParams = new URLSearchParams(s);
    for (const [k, v] of extraParams.entries()) {
      searchParams.append(k, v);
    }
  }

  if (url.query) {
    if (typeof url.query === 'string') {
      const q = url.query.startsWith('?') ? url.query.slice(1) : url.query;
      const qParams = new URLSearchParams(q);
      for (const [k, v] of qParams.entries()) {
        searchParams.append(k, v);
      }
    } else if (typeof url.query === 'object') {
      for (const [key, val] of Object.entries(url.query)) {
        if (val === undefined || val === null) {
          continue;
        }
        if (Array.isArray(val)) {
          searchParams.delete(key);
          for (const item of val) {
            if (item !== undefined && item !== null) {
              searchParams.append(key, String(item));
            }
          }
        } else {
          searchParams.set(key, String(val));
        }
      }
    }
  }

  const queryString = searchParams.toString();
  const res = queryString ? `${pathname}?${queryString}` : pathname;
  return hashStr ? `${res}${hashStr}` : res;
}

/** Next puts route params and search params in the same `query` object. */
export function mergeQuery(
  params: Readonly<Record<string, string | undefined>>,
  search: URLSearchParams | string,
): Query {
  const query: Query = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) {
      query[k] = v;
    }
  }
  const searchParams =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    // Next represents a repeated key as an array and a single key as a string.
    query[key] = values.length > 1 ? values : values[0];
  }
  return query;
}

const defaultEvents: RouterEvents = {
  on: () => {},
  off: () => {},
  emit: () => {},
};

export function useRouter() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();

  return useMemo(
    () => ({
      // Next's pages router reports the route *pattern* here ("/share/[token]").
      // Every comparison in this app is against a static route, so the concrete
      // path is equivalent — and it is what the `startsWith`/`includes` checks
      // in the layout actually want.
      pathname: location.pathname,
      asPath: location.pathname + location.search + location.hash,
      query: mergeQuery(params, searchParams),
      push: (url: string | UrlObject, _as?: string | UrlObject, _options?: TransitionOptions): Promise<boolean> => {
        navigate(toHref(url));
        return Promise.resolve(true);
      },
      replace: (url: string | UrlObject, _as?: string | UrlObject, _options?: TransitionOptions): Promise<boolean> => {
        navigate(toHref(url), { replace: true });
        return Promise.resolve(true);
      },
      back: () => navigate(-1),
      reload: () => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      },
      prefetch: (_url: string | UrlObject) => Promise.resolve(),
      beforePopState: (_cb: any) => {},
      events: defaultEvents,
      // react-router resolves params synchronously, so there is no pre-hydration
      // window where `query` is empty — the guard those call sites wait on has
      // already passed by the time they run.
      isReady: true,
      // Only ever true for Next's fallback SSG, which this app never used.
      isFallback: false,
      isPreview: false,
      isLocaleDomain: false,
    }),
    [location.pathname, location.search, location.hash, params, searchParams, navigate],
  );
}

export default useRouter;
